---
title: "Vue3 模板语法"
date: 2024-11-20
categories:
  - [前端交互, Vue3]
tags: [Vue3, 模板]
description: "Vue 使用了基于 HTML 的模板语法，允许开发者声明式地将 DOM 绑定至底层 Vue 实例的数据。"
abbrlink: 1075354097
---

Vue 使用了基于 HTML 的模板语法，允许开发者声明式地将 DOM 绑定至底层 Vue 实例的数据。

Vue 的核心是一个允许你采用简洁的模板语法来声明式的将数据渲染进 DOM 的系统。

结合响应系统，在应用状态改变时， Vue 能够智能地计算出重新渲染组件的最小代价并应用到 DOM 操作上。

```html
<template>
  <div>
    <!-- 插值 -->
    <p>{{ message }}</p>
    
    <!-- v-bind -->
    <a :href="url">Link</a>
    
    <!-- v-on -->
    <button @click="handleClick">Click me</button>
    
    <!-- v-for -->
    <ul>
      <li v-for="item in items" :key="item.id">{{ item.name }}</li>
    </ul>
  </div>
</template>
```

## 插值

### 文本

数据绑定最常见的形式就是使用 **{% raw %}{{...}}{% endraw %}**（双大括号）的文本插值：

```html
<div id="app">
  <p>{{ message }}</p>
</div>
```

**{% raw %}{{...}}{% endraw %}** 标签的内容将会被替代为对应组件实例中 **message** 属性的值，如果 **message** 属性的值发生了改变，**{% raw %}{{...}}{% endraw %}** 标签内容也会更新。

如果不想改变标签的内容，可以通过使用 **v-once** 指令执行一次性地插值，当数据改变时，插值处的内容不会更新。

```
<span v-once>这个将不会改变: {{ message }}</span>
```

### Html

使用 v-html 指令用于输出 html 代码：

```html
<div id="example1" class="demo">
    <p>使用双大括号的文本插值: {{ rawHtml }}</p>
    <p>使用 v-html 指令: <span v-html="rawHtml"></span></p>
</div>
 
<script>
const RenderHtmlApp = {
  data() {
    return {
      rawHtml: '<span style="color: red">这里会显示红色！</span>'
    }
  }
}
 
Vue.createApp(RenderHtmlApp).mount('#example1')
</script>
```

### 属性

HTML 属性中的值应使用 v-bind 指令。

```
<div v-bind:id="dynamicId"></div>
```

对于布尔属性，常规值为 true 或 false，如果属性值为 null 或 undefined，则该属性不会显示出来。

```
<button v-bind:disabled="isButtonDisabled">按钮</button>
```

以上代码中如果 isButtonDisabled 的值是 null 或 undefined，则 disabled 属性甚至不会被包含在渲染出来的 <button> 元素中。

以下实例判断 use 的值，如果为 true 使用 class1 类的样式，否则不使用该类：

```html
<div id="app">
  <label for="r1">修改颜色</label><input type="checkbox" v-model="use" id="r1">
  <br><br>
  <div v-bind:class="{'class1': use}">
    v-bind:class 指令
  </div>
</div>
    
<script>
const app = {
  data() {
    return {
      use: false
    }
  }
}
 
Vue.createApp(app).mount('#app')
</script>
```

### 表达式

Vue.js 都提供了完全的 JavaScript 表达式支持。

```html
<div id="app">
    {{5+5}}<br>
    {{ ok ? 'YES' : 'NO' }}<br>
    {{ message.split('').reverse().join('') }}
    <div v-bind:id="'list-' + id">菜鸟教程</div>
</div>
    
<script>
const app = {
  data() {
    return {
      ok: true,
      message: 'RUNOOB!!',
      id: 1
    }
  }
}
 
Vue.createApp(app).mount('#app')
</script>
```

表达式会在当前活动实例的数据作用域下作为 JavaScript 被解析。有个限制就是，每个绑定都只能包含单个表达式，所以下面的例子都不会生效:

```
<!--  这是语句，不是表达式：-->
{{ var a = 1 }}

<!-- 流控制也不会生效，请使用三元表达式 -->
{{ if (ok) { return message } }}
```

------

## 指令

指令是带有 v- 前缀的特殊属性。

指令用于在表达式的值改变时，将某些行为应用到 DOM 上。如下例子：

```html
<div id="app">
    <p v-if="seen">现在你看到我了</p>
</div>
    
<script>
const app = {
  data() {
    return {
      seen: true  /* 改为false，信息就无法显示 */
    }
  }
}
 
Vue.createApp(app).mount('#app')
</script>
```

这里， v-if 指令将根据表达式 seen 的值( true 或 false )来决定是否插入 p 元素。

另外还有其它很多指令，每个都有特殊的功能。例如，v-for 指令可以绑定数组的数据来渲染一个项目列表：

```html
<div id="app">
  <ol>
    <li v-for="site in sites">
      {{ site.text }}
    </li>
  </ol>
</div>
<script>
const app = {
  data() {
    return {
      sites: [
        { text: 'Google' },
        { text: 'Runoob' },
        { text: 'Taobao' }
      ]
    }
  }
}

Vue.createApp(app).mount('#app')
</script>
```

### 参数

参数在指令后以冒号指明。例如， v-bind 指令被用来响应地更新 HTML 属性：

```html
<div id="app">
    <p><a v-bind:href="url">菜鸟教程</a></p>
</div>
    
<script>
const app = {
  data() {
    return {
      url: 'https://www.runoob.com'
    }
  }
}
 
Vue.createApp(app).mount('#app')
</script>
```

在这里 href 是参数，告知 v-bind 指令将该元素的 href 属性与表达式 url 的值绑定。

另一个例子是 v-on 指令，它用于监听 DOM 事件：

```
<!-- 完整语法 -->
<a v-on:click="doSomething"> ... </a>

<!-- 缩写 -->
<a @click="doSomething"> ... </a>

<!-- 动态参数的缩写 (2.6.0+) -->
<a @[event]="doSomething"> ... </a>
```

在这里参数是监听的事件名。

### 修饰符

修饰符是以半角句号 **.** 指明的特殊后缀，用于指出一个指令应该以特殊方式绑定。例如，**.prevent** 修饰符告诉 **v-on** 指令对于触发的事件调用 **event.preventDefault()**：

```
<form v-on:submit.prevent="onSubmit"></form>
```

------

## 用户输入

在 input 输入框中我们可以使用 v-model 指令来实现双向数据绑定：

```html
<div id="app">
    <p>{{ message }}</p>
    <input v-model="message">
</div>
 
<script>
const app = {
  data() {
    return {
      message: 'Runoob!'
    }
  }
}
 
Vue.createApp(app).mount('#app')
</script>
```

**v-model** 指令用来在 input、select、textarea、checkbox、radio 等表单控件元素上创建双向数据绑定，根据表单上的值，自动更新绑定的元素的值。

按钮的事件我们可以使用 v-on 监听事件，并对用户的输入进行响应。

以下实例在用户点击按钮后对字符串进行反转操作：

```html
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Vue 测试实例 - 菜鸟教程(runoob.com)</title>
<script src="https://unpkg.com/vue@next"></script>
</head>
<body>
<div id="app">
    <p>{{ message }}</p>
    <button v-on:click="reverseMessage">反转字符串</button>
</div>
    
<script>
const app = {
  data() {
    return {
      message: 'Runoob!'
    }
  },
  methods: {
    reverseMessage() {
      this.message = this.message
        .split('')
        .reverse()
        .join('')
    }
  }
}
 
Vue.createApp(app).mount('#app')
</script>
```

## 缩写

### v-bind 缩写

Vue.js 为两个最为常用的指令提供了特别的缩写：

```
<!-- 完整语法 -->
<a v-bind:href="url"></a>
<!-- 缩写 -->
<a :href="url"></a>
```

### v-on 缩写

```
<!-- 完整语法 -->
<a v-on:click="doSomething"></a>
<!-- 缩写 -->
<a @click="doSomething"></a>
```