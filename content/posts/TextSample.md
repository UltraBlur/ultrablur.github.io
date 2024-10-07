---
title: "文字样式测试 TextSample"
date: 2024-10-04T16:07:22+08:00
showDate: false
draft: true
tags: ["blog","test"]
---
true
# 一级标题

## 二级标题

### 三级标题

#### 四级标题

##### 五级标题

###### 六级标题
**这个是粗体**

***这个是粗体加斜体***

- 无序列表 1
- 无序列表 2
  - 无序列表 2.1
  - 无序列表 2.2

  这是超链接样式测试[Gao Huyuchen](https://127.0.0.1:1313/)



### 1.1.2 分割线
---

### 1.1.3 表格


| 姓名   | 年龄 |     工作 |
| :----- | :--: | -------: |
| 测试者1 |  18  | 吃可爱多 |
| 测试者2 |  20  | 爬棵勇敢树 |
| 测试者3 |  22  | 看一本机智书 |


## 1.2 特殊语法

### 1.2.1 脚注

```markdown
链接：[文字](链接)
脚注：[文字](脚注解释 "脚注名字")
```

有人认为在[大前端时代](https://en.wikipedia.org/wiki/Front-end_web_development "Front-end web development")的背景下，移动端开发（Android、IOS）将逐步退出历史舞台。

[全栈工程师](是指掌握多种技能，并能利用多种技能独立完成产品的人。 "什么是全栈工程师")在业务开发流程中起到了至关重要的作用。

### 1.3 代码块

> 测试了Hugo支持代码块

如果在一个行内需要引用代码，只要用反引号引起来就好，如下：

Use the `printf()` function.

在需要高亮的代码块的前一行及后一行使用三个反引号，同时**第一行反引号后面表示代码块所使用的语言**，如下：

```java
// FileName: HelloWorld.java
public class HelloWorld {
  // Java 入口程序，程序从此入口
  public static void main(String[] args) {
    System.out.println("Hello,World!"); // 向控制台打印一条语句
  }
}
```

```
bash
xml
yaml
```

```diff
+ 新增项
- 删除项
```
### 3.3 数学公式

*测试了Hugo不支持公式*

$\ce{Hg^2+ ->[I-] HgI2 ->[I-] [Hg^{II}I4]^2-}$

$$H(D_2) = -\left(\frac{2}{4}\log_2 \frac{2}{4} + \frac{2}{4}\log_2 \frac{2}{4}\right) = 1$$

矩阵：
$$
  \begin{pmatrix}
  1 & a_1 & a_1^2 & \cdots & a_1^n \\
  1 & a_2 & a_2^2 & \cdots & a_2^n \\
  \vdots & \vdots & \vdots & \ddots & \vdots \\
  1 & a_m & a_m^2 & \cdots & a_m^n \\
  \end{pmatrix}
$$
