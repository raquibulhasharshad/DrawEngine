#include <drogon/drogon.h>
#include <iostream>
#include <cstdlib>
#include "controllers/AuthController.h"
#include "controllers/DesignController.h"

using namespace drogon;

int main() {
    // Force SSL for PostgreSQL (required for Neon DB)
    _putenv("PGSSLMODE=require");

    // 1. Environment Overrides
    const char* portEnv = std::getenv("PORT");
    int port = portEnv ? std::stoi(portEnv) : 8080;

    const char* dbUrl = std::getenv("DATABASE_URL");
    const char* jwtSecret = std::getenv("JWT_SECRET");
    const char* allowedOrigin = std::getenv("ALLOWED_ORIGIN");
    if (!allowedOrigin) allowedOrigin = "*";

    try {
        // Load base config
        app().loadConfigFile("./config.json");

        // Override settings from environment
        app().addListener("0.0.0.0", port);
        
        if (jwtSecret) {
            app().setCustomConfigValue("jwt_secret", jwtSecret);
        }

        // Global CORS Handler
        app().registerPostRoutingAdvice([allowedOrigin](const HttpRequestPtr &req, const HttpResponsePtr &res) {
            res->addHeader("Access-Control-Allow-Origin", allowedOrigin);
            res->addHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
            res->addHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With");
            res->addHeader("Access-Control-Allow-Credentials", "true");
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
