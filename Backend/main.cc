#include <drogon/drogon.h>
#include <fstream>
#include <regex>
#include <cstdlib>
#include "controllers/AuthController.h"
#include "controllers/DesignController.h"

using namespace drogon;

// Helper to parse postgres://user:pass@host:port/db
void parseDatabaseUrl(const std::string &url, Json::Value &dbConfig) {
    std::regex urlRegex("postgres://([^:]+):([^@]+)@([^:/]+):?(\\d*)?/([^?#]+)");
    std::smatch match;
    if (std::regex_search(url, match, urlRegex)) {
        dbConfig["user"] = match[1].str();
        dbConfig["passwd"] = match[2].str();
        dbConfig["host"] = match[3].str();
        dbConfig["port"] = match[4].str().empty() ? 5432 : std::stoi(match[4].str());
        dbConfig["dbname"] = match[5].str();
    }
}

int main() {
    // Force SSL for PostgreSQL (required for Neon DB)
    putenv((char*)"PGSSLMODE=require");

    // 1. Environment Overrides
    const char* portEnv = std::getenv("PORT");
    int port = portEnv ? std::stoi(portEnv) : 8080;

    const char* dbUrlEnv = std::getenv("DATABASE_URL");
    const char* allowedOriginEnv = std::getenv("ALLOWED_ORIGIN");
    std::string allowedOrigin = allowedOriginEnv ? allowedOriginEnv : "*";

    try {
        // Load base config
        Json::Value config;
        std::ifstream ifs("./config.json");
        if (ifs.is_open()) {
            ifs >> config;
        }

        // Override DB if environment variable is present
        if (dbUrlEnv) {
            parseDatabaseUrl(dbUrlEnv, config["db_clients"][0]);
        }

        // Override Port
        config["listeners"][0]["port"] = port;

        app().loadConfig(config);
        
        // Global CORS Handler (Production Grade)
        app().registerPostHandlingAdvice([allowedOrigin](const HttpRequestPtr &req, const HttpResponsePtr &res) {
            // If origin is *, we cannot allow credentials. 
            // Better to echo the request origin if allowed.
            std::string requestOrigin = req->getHeader("Origin");
            
            if (allowedOrigin == "*" || allowedOrigin == requestOrigin) {
                res->addHeader("Access-Control-Allow-Origin", requestOrigin.empty() ? allowedOrigin : requestOrigin);
                res->addHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
                res->addHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
                res->addHeader("Access-Control-Allow-Credentials", "true");
            }
        });

        // Initialize Database Schema
        app().registerBeginningAdvice([]() {
            auto dbClient = app().getDbClient();
            
            dbClient->execSqlAsync(
                "CREATE TABLE IF NOT EXISTS users ("
                "id SERIAL PRIMARY KEY, "
                "full_name TEXT NOT NULL, "
                "email TEXT UNIQUE NOT NULL, "
                "password_hash TEXT NOT NULL, "
                "created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP"
                ")",
                [dbClient](const drogon::orm::Result &r) {
                    dbClient->execSqlAsync(
                        "CREATE TABLE IF NOT EXISTS designs ("
                        "id SERIAL PRIMARY KEY, "
                        "user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE, "
                        "name TEXT NOT NULL, "
                        "data JSONB NOT NULL, "
                        "created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, "
                        "updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP"
                        ")",
                        [dbClient](const drogon::orm::Result &r) {
                            dbClient->execSqlAsync(
                                "CREATE INDEX IF NOT EXISTS idx_designs_user_id ON designs(user_id)",
                                [](const drogon::orm::Result &r) {
                                    LOG_INFO << "Database schema initialized successfully";
                                },
                                [](const drogon::orm::DrogonDbException &e) {
                                    LOG_ERROR << "Failed to create index: " << e.base().what();
                                }
                            );
                        },
                        [](const drogon::orm::DrogonDbException &e) {
                            LOG_ERROR << "Failed to create designs table: " << e.base().what();
                        }
                    );
                },
                [](const drogon::orm::DrogonDbException &e) {
                    LOG_ERROR << "Failed to create users table: " << e.base().what();
                }
            );
        });

        // Register Handlers (Manual registration to ensure compatibility)
        auto authCtrl = std::make_shared<controllers::AuthController>();
        app().registerHandler("/api/register", [authCtrl](const HttpRequestPtr& req, std::function<void(const HttpResponsePtr&)> &&callback) {
            authCtrl->registerUser(req, std::move(callback));
        }, {Post});

        app().registerHandler("/api/login", [authCtrl](const HttpRequestPtr& req, std::function<void(const HttpResponsePtr&)> &&callback) {
            authCtrl->login(req, std::move(callback));
        }, {Post});

        app().registerHandler("/api/user/profile", [authCtrl](const HttpRequestPtr& req, std::function<void(const HttpResponsePtr&)> &&callback) {
            authCtrl->updateProfile(req, std::move(callback));
        }, {Post, "filters::JwtFilter"});

        app().registerHandler("/api/user/password", [authCtrl](const HttpRequestPtr& req, std::function<void(const HttpResponsePtr&)> &&callback) {
            authCtrl->changePassword(req, std::move(callback));
        }, {Post, "filters::JwtFilter"});

        app().registerHandler("/api/user/delete", [authCtrl](const HttpRequestPtr& req, std::function<void(const HttpResponsePtr&)> &&callback) {
            authCtrl->deleteAccount(req, std::move(callback));
        }, {Post, "filters::JwtFilter"});

        app().registerHandler("/api/user/logout", [authCtrl](const HttpRequestPtr& req, std::function<void(const HttpResponsePtr&)> &&callback) {
            authCtrl->logout(req, std::move(callback));
        }, {Post});

        app().registerHandler("/api/user/me", [authCtrl](const HttpRequestPtr& req, std::function<void(const HttpResponsePtr&)> &&callback) {
            authCtrl->getMe(req, std::move(callback));
        }, {Get, "filters::JwtFilter"});

        auto designCtrl = std::make_shared<controllers::DesignController>();
        app().registerHandler("/api/designs", [designCtrl](const HttpRequestPtr& req, std::function<void(const HttpResponsePtr&)> &&callback) {
            designCtrl->getAll(req, std::move(callback));
        }, {Get, "filters::JwtFilter"});

        app().registerHandler("/api/designs", [designCtrl](const HttpRequestPtr& req, std::function<void(const HttpResponsePtr&)> &&callback) {
            designCtrl->save(req, std::move(callback));
        }, {Post, "filters::JwtFilter"});

        app().registerHandler("/api/designs/{id}", [designCtrl](const HttpRequestPtr& req, std::function<void(const HttpResponsePtr&)> &&callback, int id) {
            designCtrl->remove(req, std::move(callback), id);
        }, {Delete, "filters::JwtFilter"});

        app().registerHandler("/api/designs/batch-delete", [designCtrl](const HttpRequestPtr& req, std::function<void(const HttpResponsePtr&)> &&callback) {
            designCtrl->removeBatch(req, std::move(callback));
        }, {Post, "filters::JwtFilter"});

        LOG_INFO << "DrawEngine Terminal active on port " << port;
        app().run();
    } catch (const std::exception &e) {
        LOG_ERROR << "Critical Failure: " << e.what();
        return 1;
    }

    return 0;
}
