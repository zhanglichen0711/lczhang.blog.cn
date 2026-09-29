---
title: "Vue3 起步"
date: 2024-10-31
categories:
  - [前端交互, Vue3]
tags: [Vue3, 环境搭建]
description: "Vue.js 是一个渐进式 JavaScript 框架，主要用于构建用户界面。"
abbrlink: 2332561607
---

Vue.js 是一个渐进式 JavaScript 框架，主要用于构建用户界面。

刚开始学习 Vue，我们不推荐使用 vue-cli 命令行工具来创建项目，更简单的方式是直接在页面引入 vue.global.js 文件来测试学习。

Vue3 中的应用是通过使用 createApp 函数来创建的，语法格式如下：

```
const app = Vue.createApp({ /* 根组件选项 */ })
```

传递给 createApp 的选项用于配置根组件。

应用实例必须在调用了 **.mount()** 方法后才会渲染出来，**.mount()**方法接收一个"容器"参数，可以是一个实际的 DOM 元素或是一个 CSS 选择器字符串：

```
<div id="app"></div>
app.mount('#app')
```

一个简单的实例：

```
Vue.createApp(HelloVueApp).mount('#hello-vue')
```

createApp 的参数是根组件（HelloVueApp），在挂载应用时，该组件是渲染的起点。

一个应用需要被挂载到一个 DOM 元素中，以上代码使用 **mount('#hello-vue')** 将 Vue 应用 HelloVueApp 挂载到 **<div id="hello-vue"></div>** 中。

接下来我们从 **Hello Vue!!** 的代码开始学起。

```html
<div id="hello-vue" class="demo">
  {{ message }}
</div>

<script>
const HelloVueApp = {
  data() {
    return {
      message: 'Hello Vue!!'
    }
  }
}
Vue.createApp(HelloVueApp).mount('#hello-vue')
</script>
```

以上实例中，我们先在 HTML 页面中引入 Vue 的 JS 文件：

```
<script src="https://cdn.staticfile.net/vue/3.2.36/vue.global.min.js"></script>
```

HTML 页面中有一个 div 元素:

```
<div id="hello-vue" class="demo">
  {{ message }}
</div>
```

**mount('#hello-vue')** 将 Vue 应用 HelloVueApp 挂载到 **<div id="hello-vue"></div>** 中。

**{% raw %}{{ }}{% endraw %}** 用于输出对象属性和函数返回值。

**{% raw %}{{ message }}{% endraw %}** 对应应用中 **message** 的值。

### 根组件模板

根组件的模板通常嵌入在组件定义中，不过也可以通过直接在挂载点的容器内定义模板来单独指定。

```html
<div id="app">
    <button @click="count++">{{ count }}</button>
</div>
<script>
const { createApp, ref } = Vue;
const app = createApp({
    setup() {
        const count = ref(0);
        function increment() {
            count.value++;
        };    
        return { count, increment };
    }
});
app.mount('#app')
</script>
```

以上实例中，我们先在 HTML 页面中引入 Vue 的 JS 文件：

```
<script src="https://cdn.staticfile.net/vue/3.2.36/vue.global.min.js"></script>
```

HTML 页面中有一个 div 元素:

```
<div id="hello-vue" class="demo">
  {{ message }}
</div>
```

**mount('#hello-vue')** 将 Vue 应用 HelloVueApp 挂载到 **<div id="hello-vue"></div>** 中。

**{% raw %}{{ }}{% endraw %}** 用于输出对象属性和函数返回值。

**{% raw %}{{ message }}{% endraw %}** 对应应用中 **message** 的值。

### 根组件模板

根组件的模板通常嵌入在组件定义中，不过也可以通过直接在挂载点的容器内定义模板来单独指定。

## 实例

```html
<div id="app">
    <button @click="count++">{{ count }}</button>
</div>
<script>
const { createApp, ref } = Vue;
const app = createApp({
    setup() {
        const count = ref(0);
        function increment() {
            count.value++;
        };
        return{ count, increment };
   }
});
app.mount('#app')
</script>
```

当根组件没有设置 template 选项时，Vue 将自动使用容器的 innerHTML 作为模板。

**代码说明：**

- **使用`setup`函数**：在Vue 3中，组件的逻辑通常在`setup`函数中定义。这里我们使用`setup`函数来定义响应式数据`count`和方法`increment`。
- **使用`ref`**：在`setup`函数中，我们使用`ref`来创建响应式数据`count`。
- **定义`increment`方法**：定义一个`increment`方法来增加`count`的值。
- **返回响应式数据和方法**：在`setup`函数中返回`count`和`increment`，这样它们就可以在模板中被访问和使用。

### data 选项

**data 选项**是一个函数。Vue 在创建新组件实例的过程中调用此函数。它应该返回一个对象，然后 Vue 会通过响应性系统将其包裹起来，并以 $data 的形式存储在组件实例中。

```html
const app = Vue.createApp({
  data() {
    return { count: 4 }
  }
})

const vm = app.mount('#app')

document.write(vm.$data.count) // => 4
document.write("<br>")
document.write(vm.count)       // => 4
document.write("<br>")
// 修改 vm.count 的值也会更新 $data.count
vm.count = 5
document.write(vm.$data.count) // => 5
document.write("<br>")
// 反之亦然
vm.$data.count = 6
document.write(vm.count) // => 6
```

以上实例属性仅在实例首次创建时被添加，所以你需要确保它们都在 data 函数返回的对象中。

## 方法

我们可以在组件中添加方法，使用 **methods** 选项，该选项包含了所需方法的对象。

以下实例我们添加了 methods 选项，选项中包含了 **increment()** 方法：

```html
const app = Vue.createApp({
  data() {
    return { count: 4 }
  },
  methods: {
    increment() {
      // `this` 指向该组件实例
      this.count++
    }
  }
})

const vm = app.mount('#app')

document.write(vm.count) // => 4
document.write("<br>")
vm.increment()

document.write(vm.count) // => 5
```

