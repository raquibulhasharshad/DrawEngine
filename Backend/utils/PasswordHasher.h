#pragma once
#include <string>
#include <vector>
#include <iomanip>
#include <sstream>
#include <random>
#include <openssl/evp.h>
#include <openssl/rand.h>

class PasswordHasher {
public:
    static std::string hashPassword(const std::string& password) {
        unsigned char salt[16];
        if (RAND_bytes(salt, sizeof(salt)) != 1) {
            return "";
        }

        unsigned char hash[32]; // SHA-256
        if (PKCS5_PBKDF2_HMAC(password.c_str(), password.length(),
                              salt, sizeof(salt),
                              10000, EVP_sha256(),
                              sizeof(hash), hash) != 1) {
            return "";
        }

        return toHex(salt, sizeof(salt)) + ":" + toHex(hash, sizeof(hash));
    }

    static bool verifyPassword(const std::string& password, const std::string& storedHash) {
        size_t colonPos = storedHash.find(':');
        if (colonPos == std::string::npos) return false;

        std::string saltHex = storedHash.substr(0, colonPos);
        std::string hashHex = storedHash.substr(colonPos + 1);

        auto salt = fromHex(saltHex);
        auto originalHash = fromHex(hashHex);

        unsigned char newHash[32];
        if (PKCS5_PBKDF2_HMAC(password.c_str(), password.length(),
                              salt.data(), salt.size(),
                              10000, EVP_sha256(),
                              sizeof(newHash), newHash) != 1) {
            return false;
        }

        // Constant time comparison (simplified)
        return toHex(newHash, sizeof(newHash)) == hashHex;
    }

private:
    static std::string toHex(const unsigned char* data, size_t len) {
        std::stringstream ss;
        ss << std::hex << std::setfill('0');
        for (size_t i = 0; i < len; ++i) {
            ss << std::setw(2) << static_cast<int>(data[i]);
        }
        return ss.str();
    }

    static std::vector<unsigned char> fromHex(const std::string& hex) {
        std::vector<unsigned char> data;
        for (size_t i = 0; i < hex.length(); i += 2) {
            std::string byteString = hex.substr(i, 2);
            unsigned char byte = static_cast<unsigned char>(std::stoi(byteString, nullptr, 16));
            data.push_back(byte);
        }
        return data;
    }
};
