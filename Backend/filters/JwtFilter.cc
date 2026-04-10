#include "JwtFilter.h"
#include <drogon/drogon.h>

namespace filters {

void JwtFilter::doFilter(const HttpRequestPtr &req, FilterCallback &&fcb, FilterChainCallback &&fccb) {
    std::string token = req->getCookie("auth_token");
    
    if (token.empty()) {
        auto authHeader = req->getHeader("Authorization");
        if (!authHeader.empty() && authHeader.find("Bearer ") == 0) {
            token = authHeader.substr(7);
        }
    }

    if (token.empty()) {
        auto res = HttpResponse::newHttpResponse();
        res->setStatusCode(k401Unauthorized);
        fcb(res);
        return;
    }

    // In production: use jwt-cpp to verify and decode
    // For MVP demonstration, we expect "header.payload_USERID_USERNAME.signature"
    
    try {
        // Simplified parsing for demonstration
        size_t first_dot = token.find('.');
        size_t second_dot = token.find('.', first_dot + 1);
        
        if (first_dot == std::string::npos || second_dot == std::string::npos) {
             throw std::runtime_error("Invalid token format");
        }

        std::string payload = token.substr(first_dot + 1, second_dot - first_dot - 1);
        
        // Extract userID (after "payload_")
        size_t id_start = payload.find('_') + 1;
        size_t id_end = payload.find('_', id_start);
        
        if (id_start == 0 || id_end == std::string::npos) {
             throw std::runtime_error("Invalid payload format");
        }

        int userId = std::stoi(payload.substr(id_start, id_end - id_start));
        
        // Inject into request attributes for controllers to use
        req->attributes()->insert("userId", userId);
        
        fccb(); // Success: Continue to controller
    } catch (...) {
        auto res = HttpResponse::newHttpResponse();
        res->setStatusCode(k401Unauthorized);
        fcb(res);
    }
}

} // namespace filters
