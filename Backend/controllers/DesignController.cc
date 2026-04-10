#include "DesignController.h"
#include "Design.h"
#include <drogon/drogon.h>

namespace controllers {

void DesignController::getAll(const HttpRequestPtr &req, std::function<void(const HttpResponsePtr &)> &&callback) {
    int userId = req->attributes()->get<int>("userId");

    models::Design::getAllByUser(
        userId,
        [callback](const std::vector<models::Design> &designs) {
            Json::Value ret(Json::arrayValue);
            for (const auto &design : designs) {
                ret.append(design.toJson());
            }
            callback(HttpResponse::newHttpJsonResponse(ret));
        },
        [callback](const std::string &error) {
            LOG_ERROR << error;
            auto res = HttpResponse::newHttpResponse();
            res->setStatusCode(k500InternalServerError);
            callback(res);
        }
    );
}

void DesignController::save(const HttpRequestPtr &req, std::function<void(const HttpResponsePtr &)> &&callback) {
    int userId = req->attributes()->get<int>("userId");
    auto json = req->getJsonObject();
    
    if (!json || !json->isMember("name") || !json->isMember("data")) {
        auto res = HttpResponse::newHttpResponse();
        res->setStatusCode(k400BadRequest);
        callback(res);
        return;
    }

    models::Design::save(
        userId,
        *json,
        [callback](int designId) {
            Json::Value ret;
            ret["id"] = designId;
            ret["status"] = "saved";
            callback(HttpResponse::newHttpJsonResponse(ret));
        },
        [callback](const std::string &error) {
            LOG_ERROR << error;
            auto res = HttpResponse::newHttpResponse();
            res->setStatusCode(k500InternalServerError);
            callback(res);
        }
    );
}

void DesignController::remove(const HttpRequestPtr &req, std::function<void(const HttpResponsePtr &)> &&callback, int id) {
    int userId = req->attributes()->get<int>("userId");
    
    models::Design::remove(
        userId,
        id,
        [callback]() {
            Json::Value ret;
            ret["status"] = "deleted";
            callback(HttpResponse::newHttpJsonResponse(ret));
        },
        [callback](const std::string &error) {
            LOG_ERROR << error;
            auto res = HttpResponse::newHttpResponse();
            res->setStatusCode(k500InternalServerError);
            callback(res);
        }
    );
}

void DesignController::removeBatch(const HttpRequestPtr &req, std::function<void(const HttpResponsePtr &)> &&callback) {
    int userId = req->attributes()->get<int>("userId");
    auto json = req->getJsonObject();
    
    if (!json || !json->isMember("ids") || !(*json)["ids"].isArray()) {
        auto res = HttpResponse::newHttpResponse();
        res->setStatusCode(k400BadRequest);
        callback(res);
        return;
    }

    std::vector<int> designIds;
    for (auto const &idJson : (*json)["ids"]) {
        designIds.push_back(idJson.asInt());
    }
    
    models::Design::removeBatch(
        userId,
        designIds,
        [callback]() {
            Json::Value ret;
            ret["status"] = "batch_deleted";
            callback(HttpResponse::newHttpJsonResponse(ret));
        },
        [callback](const std::string &error) {
            LOG_ERROR << error;
            auto res = HttpResponse::newHttpResponse();
            res->setStatusCode(k500InternalServerError);
            callback(res);
        }
    );
}

} // namespace controllers
