#include "Design.h"
#include <drogon/drogon.h>

namespace models {

Design Design::fromRow(const drogon::orm::Row &row) {
    Design design;
    design.id = row["id"].as<int>();
    design.name = row["name"].as<std::string>();
    
    // Parse JSON data
    try {
        design.data = row["data"].as<Json::Value>();
    } catch(...) {
        Json::Reader reader;
        reader.parse(row["data"].as<std::string>(), design.data);
    }
    
    design.updatedAt = row["updated_at"].as<std::string>();
    return design;
}

Json::Value Design::toJson() const {
    Json::Value json;
    json["id"] = id;
    json["name"] = name;
    json["data"] = data;
    json["updated_at"] = updatedAt;
    return json;
}

void Design::getAllByUser(int userId, 
                           std::function<void(const std::vector<Design>&)> &&successCallback, 
                           std::function<void(const std::string&)> &&errorCallback) {
    auto dbClient = drogon::app().getDbClient();
    dbClient->execSqlAsync(
        "SELECT id, name, data, updated_at FROM designs WHERE user_id = $1 ORDER BY updated_at DESC",
        [successCallback](const drogon::orm::Result &result) {
            std::vector<Design> designs;
            for (auto const &row : result) {
                designs.push_back(Design::fromRow(row));
            }
            successCallback(designs);
        },
        [errorCallback](const drogon::orm::DrogonDbException &e) {
            errorCallback(e.base().what());
        },
        userId
    );
}

void Design::save(int userId, 
                  const Json::Value &designJson, 
                  std::function<void(int)> &&successCallback, 
                  std::function<void(const std::string&)> &&errorCallback) {
    
    std::string name = designJson["name"].asString();
    Json::Value data = designJson["data"];
    auto dbClient = drogon::app().getDbClient();
    
    if (designJson.isMember("id") && !designJson["id"].isNull() && designJson["id"].asInt() != 0) {
        // Update
        int designId = designJson["id"].asInt();
        dbClient->execSqlAsync(
            "UPDATE designs SET name = $1, data = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 AND user_id = $4",
            [successCallback, designId](const drogon::orm::Result & /*result*/) {
                successCallback(designId);
            },
            [errorCallback](const drogon::orm::DrogonDbException &e) {
                errorCallback(e.base().what());
            },
            name, data, designId, userId
        );
    } else {
        // Insert
        dbClient->execSqlAsync(
            "INSERT INTO designs (user_id, name, data) VALUES ($1, $2, $3) RETURNING id",
            [successCallback](const drogon::orm::Result &result) {
                successCallback(result[0]["id"].as<int>());
            },
            [errorCallback](const drogon::orm::DrogonDbException &e) {
                errorCallback(e.base().what());
            },
            userId, name, data
        );
    }
}

void Design::remove(int userId, 
                    int designId, 
                    std::function<void()> &&successCallback, 
                    std::function<void(const std::string&)> &&errorCallback) {
    auto dbClient = drogon::app().getDbClient();
    dbClient->execSqlAsync(
        "DELETE FROM designs WHERE id = $1 AND user_id = $2",
        [successCallback](const drogon::orm::Result & /*result*/) {
            successCallback();
        },
        [errorCallback](const drogon::orm::DrogonDbException &e) {
            errorCallback(e.base().what());
        },
        designId, userId
    );
}

void Design::removeBatch(int userId, 
                         const std::vector<int> &designIds, 
                         std::function<void()> &&successCallback, 
                         std::function<void(const std::string&)> &&errorCallback) {
    if (designIds.empty()) {
        successCallback();
        return;
    }

    auto dbClient = drogon::app().getDbClient();
    
    // Construct IN (1,2,3...) clause
    std::stringstream ss;
    ss << "DELETE FROM designs WHERE user_id = $1 AND id IN (";
    for (size_t i = 0; i < designIds.size(); ++i) {
        ss << designIds[i] << (i == designIds.size() - 1 ? "" : ",");
    }
    ss << ")";

    dbClient->execSqlAsync(
        ss.str(),
        [successCallback](const drogon::orm::Result & /*result*/) {
            successCallback();
        },
        [errorCallback](const drogon::orm::DrogonDbException &e) {
            errorCallback(e.base().what());
        },
        userId
    );
}

} // namespace models
