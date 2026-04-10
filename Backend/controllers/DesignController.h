#pragma once
#include <drogon/HttpController.h>

using namespace drogon;

namespace controllers {

class DesignController : public HttpController<DesignController> {
public:
    METHOD_LIST_BEGIN
    METHOD_ADD(DesignController::getAll, "/api/designs", Get, "filters::JwtFilter");
    METHOD_ADD(DesignController::save, "/api/designs", Post, "filters::JwtFilter");
    METHOD_ADD(DesignController::remove, "/api/designs/{id}", Delete, "filters::JwtFilter");
    METHOD_LIST_END

    void getAll(const HttpRequestPtr &req, std::function<void(const HttpResponsePtr &)> &&callback);
    void save(const HttpRequestPtr &req, std::function<void(const HttpResponsePtr &)> &&callback);
    void remove(const HttpRequestPtr &req, std::function<void(const HttpResponsePtr &)> &&callback, int id);
    void removeBatch(const HttpRequestPtr &req, std::function<void(const HttpResponsePtr &)> &&callback);
};

} // namespace controllers
