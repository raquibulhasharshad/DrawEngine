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

    LOG_INFO << "Starting DrawEngine with Port: " << port << " and Origin: " << allowedOrigin;

    try {
        // 2. Load base config and override in-memory
        Json::Value config;
        std::ifstream ifs("./config.json");
        if (ifs.is_open()) {
            ifs >> config;
            ifs.close();
            LOG_INFO << "Base config.json loaded";
        } else {
            LOG_WARN << "config.json not found, using defaults";
        }

        // 3. Defensive Configuration Initialization
        if (!config.isMember("db_clients") || !config["db_clients"].isArray()) {
            config["db_clients"] = Json::arrayValue;
            config["db_clients"].append(Json::Value());
        }
        if (!config.isMember("listeners") || !config["listeners"].isArray()) {
            config["listeners"] = Json::arrayValue;
            config["listeners"].append(Json::Value());
        }

        // 4. Override DB if environment variable is present
        if (dbUrlEnv) {
            LOG_INFO << "Applying DATABASE_URL overrides";
            Json::Value& dbConfig = config["db_clients"][0];
            dbConfig["name"] = "default";
            dbConfig["rdbms"] = "postgresql";
            parseDatabaseUrl(dbUrlEnv, dbConfig);
            dbConfig["is_fast"] = false;
            dbConfig["connection_number"] = 5;
        }

        // 5. Override Port and Listener
        config["listeners"][0]["port"] = port;
        config["listeners"][0]["address"] = "0.0.0.0";

        // 6. Write to runtime config file
        std::ofstream ofs("./config_runtime.json");
        Json::StreamWriterBuilder swb;
        std::unique_ptr<Json::StreamWriter> sw(swb.newStreamWriter());
        sw->write(config, &ofs);
        ofs.close();
        LOG_INFO << "Runtime config generated";

        // 7. Load the generated config
        app().loadConfigFile("./config_runtime.json");
        
        // --- Endpoints ---

        // 1. Pre-Routing Advice: Handle OPTIONS (Preflight) requests
        app().registerPreRoutingAdvice([allowedOrigin](const HttpRequestPtr &req, AdviceCallback &&acb, AdviceChainCallback &&accb) {
            if (req->method() == Options) {
                auto res = HttpResponse::newHttpResponse();
                std::string requestOrigin = req->getHeader("Origin");
                
                // Allow exact match or wildcard if specified
                if (allowedOrigin == "*" || allowedOrigin == requestOrigin) {
                    res->addHeader("Access-Control-Allow-Origin", requestOrigin.empty() ? allowedOrigin : requestOrigin);
                    res->addHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
                    res->addHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
                    res->addHeader("Access-Control-Allow-Credentials", "true");
                    res->setStatusCode(k204NoContent);
                    acb(res);
                    return;
                }
            }
            accb();
        });

        // Root Handler (to prevent 404 on cronjobs/ping services hitting /)
        app().registerHandler("/", [](const HttpRequestPtr& req, std::function<void(const HttpResponsePtr&)> &&callback) {
            auto res = HttpResponse::newHttpResponse();
            res->setBody("DrawEngine Backend is active.");
            callback(res);
        }, {Get});

        // Diagnostic Health Check
        app().registerHandler("/api/health", [](const HttpRequestPtr& req, std::function<void(const HttpResponsePtr&)> &&callback) {
            Json::Value ret;
            ret["status"] = "ok";
            ret["engine"] = "DrawEngine 1.0";
            callback(HttpResponse::newHttpJsonResponse(ret));
        }, {Get});

        // 2. Post-Handling Advice: Add CORS headers to all normal responses
        app().registerPostHandlingAdvice([allowedOrigin](const HttpRequestPtr &req, const HttpResponsePtr &res) {
            std::string requestOrigin = req->getHeader("Origin");
            
            if (allowedOrigin == "*" || allowedOrigin == requestOrigin) {
                res->removeHeader("Access-Control-Allow-Origin");
                res->addHeader("Access-Control-Allow-Origin", requestOrigin.empty() ? allowedOrigin : requestOrigin);
                
                res->removeHeader("Access-Control-Allow-Methods");
                res->addHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
                
                res->removeHeader("Access-Control-Allow-Headers");
                res->addHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
                
                res->removeHeader("Access-Control-Allow-Credentials");
                res->addHeader("Access-Control-Allow-Credentials", "true");
            }
        });

        // Initialize Database Schema
        app().registerBeginningAdvice([]() {
            auto dbClient = app().getDbClient();
            LOG_INFO << "Initializing Database Schema...";
            
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

        // Register Controller Routes
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

        app().run();
    } catch (const std::exception &e) {
        LOG_ERROR << "Critical Failure: " << e.what();
        return 1;
    }

    return 0;
}
