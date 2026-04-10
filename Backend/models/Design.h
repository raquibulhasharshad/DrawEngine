#pragma once
#include <drogon/drogon.h>
#include <json/json.h>
#include <vector>
#include <string>

namespace models {

struct Design {
    int id;
    int userId;
    std::string name;
    Json::Value data;
    std::string updatedAt;

    // Static database operations
    static void getAllByUser(int userId, 
                             std::function<void(const std::vector<Design>&)> &&successCallback, 
                             std::function<void(const std::string&)> &&errorCallback);

    static void save(int userId, 
                     const Json::Value &designJson, 
                     std::function<void(int)> &&successCallback, 
                     std::function<void(const std::string&)> &&errorCallback);

    static void remove(int userId, 
                       int designId, 
                       std::function<void()> &&successCallback, 
                       std::function<void(const std::string&)> &&errorCallback);

    static void removeBatch(int userId, 
                            const std::vector<int> &designIds, 
                            std::function<void()> &&successCallback, 
                            std::function<void(const std::string&)> &&errorCallback);
    
    // Serialization helpers
    Json::Value toJson() const;
    static Design fromRow(const drogon::orm::Row &row);
};

} // namespace models
