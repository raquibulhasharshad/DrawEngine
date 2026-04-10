#pragma once
#include <drogon/HttpController.h>

using namespace drogon;

namespace controllers {
class AuthController : public HttpController<AuthController> {
public:
    METHOD_LIST_BEGIN
    METHOD_ADD(AuthController::login, "/api/login", Post);
    METHOD_ADD(AuthController::registerUser, "/api/register", Post);
    METHOD_LIST_END

    void login(const HttpRequestPtr &req, std::function<void(const HttpResponsePtr &)> &&callback);
    void registerUser(const HttpRequestPtr &req, std::function<void(const HttpResponsePtr &)> &&callback);
    void updateProfile(const HttpRequestPtr &req, std::function<void(const HttpResponsePtr &)> &&callback);
    void changePassword(const HttpRequestPtr &req, std::function<void(const HttpResponsePtr &)> &&callback);
    void deleteAccount(const HttpRequestPtr &req, std::function<void(const HttpResponsePtr &)> &&callback);
    void logout(const HttpRequestPtr &req, std::function<void(const HttpResponsePtr &)> &&callback);
    void getMe(const HttpRequestPtr &req, std::function<void(const HttpResponsePtr &)> &&callback);

private:
    std::string generateToken(int userId, const std::string &email);
};
} // namespace controllers

// end of auth controller
