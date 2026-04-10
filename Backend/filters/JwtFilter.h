#pragma once
#include <drogon/HttpFilter.h>

using namespace drogon;

namespace filters {

class JwtFilter : public HttpFilter<JwtFilter> {
public:
    void doFilter(const HttpRequestPtr &req, FilterCallback &&fcb, FilterChainCallback &&fccb) override;
};

} // namespace filters
