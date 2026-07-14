---
title: Eighth page
description: 这是一个用于测试搜索索引在处理中日韩文字时是否能够安全地按照字符而不是字节进行截断的示例页面描述内容包含足够长的中文文本以确保触发一百个字符的截断限制并验证结果不会出现乱码或字节错误的情况发生并且这段文字还需要再长一些才能确保超过限制。
date: 2026-07-14
searchExclude: false
---

This page exercises rune-safety in a long CJK frontmatter description, so truncation is
proven to cap by rune count rather than by byte count.
