cmake_minimum_required(VERSION 3.15)
project(DrawEngine CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Find dependencies
find_package(Drogon REQUIRED)
find_package(PostgreSQL REQUIRED)

# Source files
set(SOURCE_FILES
    main.cc
    controllers/AuthController.cc
    controllers/DesignController.cc
    filters/JwtFilter.cc
    models/Design.cc
)

add_executable(${PROJECT_NAME} ${SOURCE_FILES})

# Include directories
target_include_directories(${PROJECT_NAME} PRIVATE
    ${PROJECT_SOURCE_DIR}
    ${PROJECT_SOURCE_DIR}/controllers
    ${PROJECT_SOURCE_DIR}/filters
    ${PROJECT_SOURCE_DIR}/models
)

# Link libraries
target_link_libraries(${PROJECT_NAME} PRIVATE 
    Drogon::Drogon
    PostgreSQL::PostgreSQL
)

# Compiler options
if(CMAKE_CXX_COMPILER_ID STREQUAL "GNU")
    target_compile_options(${PROJECT_NAME} PRIVATE -Wall -Wextra)
elseif(CMAKE_CXX_COMPILER_ID STREQUAL "MSVC")
    target_compile_options(${PROJECT_NAME} PRIVATE /W4)
endif()
