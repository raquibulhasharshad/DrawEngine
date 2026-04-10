#include "AuthController.h"
#include <drogon/drogon.h>
#include <json/json.h>
#include <random>
#include <iomanip>
#include <sstream>

#include "utils/PasswordHasher.h"

namespace controllers {

void AuthController::registerUser(const HttpRequestPtr &req, std::function<void(const HttpResponsePtr &)> &&callback) {
    auto json = req->getJsonObject();
    if (!json || !json->isMember("email") || !json->isMember("password") || !json->isMember("fullName")) {
        Json::Value ret;
        ret["error"] = "Name, Email and Password are required";
        auto res = HttpResponse::newHttpJsonResponse(ret);
        res->setStatusCode(k400BadRequest);
        callback(res);
        return;
    }

    std::string email = (*json)["email"].asString();
    std::string password = (*json)["password"].asString();
    std::string fullName = (*json)["fullName"].asString();

    std::string hashedPassword = PasswordHasher::hashPassword(password);

    auto dbClient = app().getDbClient();
    dbClient->execSqlAsync(
        "INSERT INTO users (full_name, email, password_hash) VALUES ($1, $2, $3) RETURNING id",
        [callback](const drogon::orm::Result &result) {
            Json::Value ret;
            ret["message"] = "Registration successful";
            ret["userId"] = result[0]["id"].as<int>();
            callback(HttpResponse::newHttpJsonResponse(ret));
        },
        [callback](const drogon::orm::DrogonDbException &e) {
            std::string err = e.base().what();
            LOG_ERROR << "DB Error: " << err;
            Json::Value ret;
            if (err.find("unique") != std::string::npos || err.find("duplicate") != std::string::npos) {
                ret["error"] = "Email already registered in our registry";
            } else {
                ret["error"] = "Terminal initialization failed: " + err;
            }
            auto res = HttpResponse::newHttpJsonResponse(ret);
            res->setStatusCode(k400BadRequest);
            callback(res);
        },
        fullName, email, hashedPassword
    );
}

void AuthController::login(const HttpRequestPtr &req, std::function<void(const HttpResponsePtr &)> &&callback) {
    auto json = req->getJsonObject();
    if (!json || !json->isMember("email") || !json->isMember("password")) {
        auto res = HttpResponse::newHttpResponse();
        res->setStatusCode(k400BadRequest);
        callback(res);
        return;
    }

    std::string email = (*json)["email"].asString();
    std::string password = (*json)["password"].asString();

    auto dbClient = app().getDbClient();
    dbClient->execSqlAsync(
        "SELECT id, email, full_name, password_hash FROM users WHERE email = $1",
        [this, callback, password, dbClient](const drogon::orm::Result &result) {
            if (result.empty()) {
                Json::Value ret;
                ret["error"] = "Invalid credentials";
                auto res = HttpResponse::newHttpJsonResponse(ret);
                res->setStatusCode(k401Unauthorized);
                callback(res);
                return;
            }

            auto row = result[0];
            std::string storedHash = row["password_hash"].as<std::string>();
            bool isCorrect = false;

            // Check for salted hash format (contains ':')
            if (storedHash.find(':') != std::string::npos) {
                isCorrect = PasswordHasher::verifyPassword(password, storedHash);
            } else {
                // Legacy plain-text check
                if (password == storedHash) {
                    isCorrect = true;
                    // Graceful Migration: Upgrade to hash on success
                    std::string newHash = PasswordHasher::hashPassword(password);
                    dbClient->execSqlAsync(
                        "UPDATE users SET password_hash = $1 WHERE id = $2",
                        [](const drogon::orm::Result &){},
                        [](const drogon::orm::DrogonDbException &){},
                        newHash, row["id"].as<int>()
                    );
                }
            }

            if (isCorrect) {
                int userId = row["id"].as<int>();
                std::string email = row["email"].as<std::string>();
                std::string fullName = row["full_name"].as<std::string>();
                
                Json::Value ret;
                ret["email"] = email;
                ret["fullName"] = fullName;
                
                auto res = HttpResponse::newHttpJsonResponse(ret);
                
                // Add secure cookie
                std::string token = generateToken(userId, email);
                Cookie authCookie("auth_token", token);
                authCookie.setHttpOnly(true);
                authCookie.setPath("/");
                authCookie.setSameSite(Cookie::SameSite::kLax); 
                res->addCookie(authCookie);
                
                callback(res);
            } else {
                Json::Value ret;
                ret["error"] = "Invalid credentials";
                auto res = HttpResponse::newHttpJsonResponse(ret);
                res->setStatusCode(k401Unauthorized);
                callback(res);
            }
        },
        [callback](const drogon::orm::DrogonDbException &e) {
            LOG_ERROR << e.base().what();
            auto res = HttpResponse::newHttpResponse();
            res->setStatusCode(k500InternalServerError);
            callback(res);
        },
        email
    );
}

void AuthController::updateProfile(const HttpRequestPtr &req, std::function<void(const HttpResponsePtr &)> &&callback) {
    int userId = req->attributes()->get<int>("userId");
    auto json = req->getJsonObject();
    
    if (!json || !json->isMember("fullName")) {
        auto res = HttpResponse::newHttpResponse();
        res->setStatusCode(k400BadRequest);
        callback(res);
        return;
    }

    std::string fullName = (*json)["fullName"].asString();

    auto dbClient = app().getDbClient();
    dbClient->execSqlAsync(
        "UPDATE users SET full_name = $1 WHERE id = $2",
        [callback, fullName](const drogon::orm::Result &result) {
            Json::Value ret;
            ret["message"] = "Profile identity updated";
            ret["fullName"] = fullName;
            callback(HttpResponse::newHttpJsonResponse(ret));
        },
        [callback](const drogon::orm::DrogonDbException &e) {
            LOG_ERROR << e.base().what();
            auto res = HttpResponse::newHttpResponse();
            res->setStatusCode(k500InternalServerError);
            callback(res);
        },
        fullName, userId
    );
}

void AuthController::changePassword(const HttpRequestPtr &req, std::function<void(const HttpResponsePtr &)> &&callback) {
    int userId = req->attributes()->get<int>("userId");
    auto json = req->getJsonObject();
    
    if (!json || !json->isMember("currentPassword") || !json->isMember("newPassword")) {
        auto res = HttpResponse::newHttpResponse();
        res->setStatusCode(k400BadRequest);
        callback(res);
        return;
    }

    std::string currentPass = (*json)["currentPassword"].asString();
    std::string newPass = (*json)["newPassword"].asString();

    auto dbClient = app().getDbClient();
    dbClient->execSqlAsync(
        "SELECT password_hash FROM users WHERE id = $1",
        [dbClient, callback, currentPass, newPass, userId](const drogon::orm::Result &result) {
            if (result.empty()) {
                Json::Value ret;
                ret["error"] = "User not found";
                auto res = HttpResponse::newHttpJsonResponse(ret);
                res->setStatusCode(k404NotFound);
                callback(res);
                return;
            }

            std::string storedHash = result[0]["password_hash"].as<std::string>();
            bool isCorrect = false;

            if (storedHash.find(':') != std::string::npos) {
                isCorrect = PasswordHasher::verifyPassword(currentPass, storedHash);
            } else {
                isCorrect = (currentPass == storedHash);
            }

            if (!isCorrect) {
                Json::Value ret;
                ret["error"] = "Incorrect current password";
                auto res = HttpResponse::newHttpJsonResponse(ret);
                res->setStatusCode(k401Unauthorized);
                callback(res);
                return;
            }

            std::string hashedNewPass = PasswordHasher::hashPassword(newPass);
            dbClient->execSqlAsync(
                "UPDATE users SET password_hash = $1 WHERE id = $2",
                [callback](const drogon::orm::Result &r) {
                    Json::Value ret;
                    ret["message"] = "Password changed successfully";
                    callback(HttpResponse::newHttpJsonResponse(ret));
                },
                [callback](const drogon::orm::DrogonDbException &e) {
                    callback(HttpResponse::newHttpResponse());
                },
                hashedNewPass, userId
            );
        },
        [callback](const drogon::orm::DrogonDbException &e) {
            callback(HttpResponse::newHttpResponse());
        },
        userId
    );
}

void AuthController::deleteAccount(const HttpRequestPtr &req, std::function<void(const HttpResponsePtr &)> &&callback) {
    int userId = req->attributes()->get<int>("userId");
    auto json = req->getJsonObject();
    
    if (!json || !json->isMember("email") || !json->isMember("password")) {
        auto res = HttpResponse::newHttpResponse();
        res->setStatusCode(k400BadRequest);
        callback(res);
        return;
    }

    std::string email = (*json)["email"].asString();
    std::string password = (*json)["password"].asString();

    auto dbClient = app().getDbClient();
    dbClient->execSqlAsync(
        "SELECT email, password_hash FROM users WHERE id = $1",
        [dbClient, callback, email, password, userId](const drogon::orm::Result &result) {
            if (result.empty()) {
                Json::Value ret;
                ret["error"] = "Invalid verification credentials";
                auto res = HttpResponse::newHttpJsonResponse(ret);
                res->setStatusCode(k401Unauthorized);
                callback(res);
                return;
            }

            auto row = result[0];
            std::string storedHash = row["password_hash"].as<std::string>();
            bool isCorrect = false;

            if (storedHash.find(':') != std::string::npos) {
                isCorrect = PasswordHasher::verifyPassword(password, storedHash);
            } else {
                isCorrect = (password == storedHash);
            }

            if (email != row["email"].as<std::string>() || !isCorrect) {
                Json::Value ret;
                ret["error"] = "Invalid verification credentials";
                auto res = HttpResponse::newHttpJsonResponse(ret);
                res->setStatusCode(k401Unauthorized);
                callback(res);
                return;
            }

            // Cascade delete will handle designs automatically
            dbClient->execSqlAsync(
                "DELETE FROM users WHERE id = $1",
                [callback](const drogon::orm::Result &r) {
                    Json::Value ret;
                    ret["message"] = "Account and all associated designs deleted permanently";
                    callback(HttpResponse::newHttpJsonResponse(ret));
                },
                [callback](const drogon::orm::DrogonDbException &e) {
                    callback(HttpResponse::newHttpResponse());
                },
                userId
            );
        },
        [callback](const drogon::orm::DrogonDbException &e) {
            callback(HttpResponse::newHttpResponse());
        },
        userId
    );
}

void AuthController::logout(const HttpRequestPtr &req, std::function<void(const HttpResponsePtr &)> &&callback) {
    auto res = HttpResponse::newHttpResponse();
    Cookie authCookie("auth_token", "");
    authCookie.setExpiresDate(trantor::Date::now().after(-86400)); // 1 day ago
    authCookie.setPath("/");
    res->addCookie(authCookie);
    
    Json::Value ret;
    ret["message"] = "Logged out successfully";
    callback(HttpResponse::newHttpJsonResponse(ret));
}

void AuthController::getMe(const HttpRequestPtr &req, std::function<void(const HttpResponsePtr &)> &&callback) {
    int userId = req->attributes()->get<int>("userId");
    
    auto dbClient = app().getDbClient();
    dbClient->execSqlAsync(
        "SELECT email, full_name FROM users WHERE id = $1",
        [callback](const drogon::orm::Result &result) {
            if (result.empty()) {
                auto res = HttpResponse::newHttpResponse();
                res->setStatusCode(k401Unauthorized);
                callback(res);
                return;
            }
            
            Json::Value ret;
            ret["email"] = result[0]["email"].as<std::string>();
            ret["fullName"] = result[0]["full_name"].as<std::string>();
            callback(HttpResponse::newHttpJsonResponse(ret));
        },
        [callback](const drogon::orm::DrogonDbException &e) {
            auto res = HttpResponse::newHttpResponse();
            res->setStatusCode(k500InternalServerError);
            callback(res);
        },
        userId
    );
}

std::string AuthController::generateToken(int userId, const std::string &email) {
    std::stringstream ss;
    ss << "header.payload_" << userId << "_" << email << ".signature";
    return ss.str();
}

} // namespace controllers
