/**
 * DocSeeker C/C++ Header Test
 * 测试 C/C++ 头文件解析
 */

#ifndef TEST_H
#define TEST_H

#define VERSION "1.0.0"
#define MAX_SIZE 1024

// 类定义
class TestClass {
public:
    TestClass();
    ~TestClass();

    int processData(const char* data);
    void setName(const std::string& name);

private:
    std::string m_name;
    int m_id;
};

#endif // TEST_H
