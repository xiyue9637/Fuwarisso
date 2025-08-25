// worker.js

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // 静态资源请求
    if (path.startsWith('/static/')) {
      return fetch(new Request('https://your-github-username.github.io/blog-static' + path));
    }

    // 页面路由
    if (path === '/') return homePage(env, url.searchParams);
    if (path === '/login') return loginPage(env);
    if (path === '/register') return registerPage(env);
    if (path === '/post') return postPage(env, url.searchParams);
    if (path === '/create') return createPostPage(env);
    if (path === '/profile') return profilePage(env, url.searchParams);
    if (path === '/rss.xml') return rssFeed(env);
    
    // API 路由
    if (path.startsWith('/api/')) {
      return handleAPI(request, env, url);
    }

    return new Response("页面未找到", { status: 404 });
  },
};

// 首页
async function homePage(env, params) {
  const page = parseInt(params.get('page')) || 1;
  const limit = 5;
  const offset = (page - 1) * limit;
  
  let posts = await getPosts(env);
  const total = posts.length;
  const totalPages = Math.ceil(total / limit);
  
  // 分页处理
  posts = posts.slice(offset, offset + limit);
  
  let html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>曦月的小窝</title>
  <style>
    /* 全局样式 */
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      line-height: 1.6;
      color: #333;
      background-color: #f5f5f5;
    }

    header {
      background-color: #fff;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      padding: 1rem 2rem;
      position: sticky;
      top: 0;
      z-index: 100;
    }

    header h1 {
      color: #2c3e50;
      margin-bottom: 0.5rem;
    }

    nav {
      display: flex;
      gap: 1rem;
      align-items: center;
    }

    nav a {
      text-decoration: none;
      color: #3498db;
      font-weight: 500;
    }

    nav a:hover {
      color: #2980b9;
    }

    main {
      max-width: 800px;
      margin: 2rem auto;
      padding: 0 1rem;
    }

    /* 首页文章列表 */
    .post-item {
      background-color: #fff;
      border-radius: 8px;
      padding: 1.5rem;
      margin-bottom: 1.5rem;
      box-shadow: 0 2px 4px rgba(0,0,0,0.05);
      transition: box-shadow 0.3s ease;
    }

    .post-item:hover {
      box-shadow: 0 4px 8px rgba(0,0,0,0.1);
    }

    .post-item h2 {
      margin-bottom: 0.5rem;
    }

    .post-item h2 a {
      color: #2c3e50;
      text-decoration: none;
    }

    .post-item h2 a:hover {
      color: #3498db;
    }

    .post-meta {
      font-size: 0.9rem;
      color: #7f8c8d;
      margin-bottom: 1rem;
    }

    .post-content {
      margin-bottom: 1rem;
      line-height: 1.8;
    }

    .post-actions {
      text-align: right;
    }

    .post-actions a {
      color: #3498db;
      text-decoration: none;
      font-weight: 500;
    }

    .pagination {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 0.5rem;
      margin-top: 2rem;
      flex-wrap: wrap;
    }

    .pagination a, .pagination span {
      padding: 0.5rem 1rem;
      border-radius: 4px;
      text-decoration: none;
      color: #3498db;
      border: 1px solid #ddd;
    }

    .pagination .current-page {
      background-color: #3498db;
      color: white;
      border-color: #3498db;
    }

    /* 分页按钮样式 */
    .pagination a:hover {
      background-color: #f0f0f0;
    }

    /* 登录/注册表单 */
    .auth-container {
      background-color: #fff;
      padding: 2rem;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      max-width: 400px;
      margin: 2rem auto;
    }

    .auth-container h2 {
      text-align: center;
      margin-bottom: 1.5rem;
      color: #2c3e50;
    }

    .form-group {
      margin-bottom: 1rem;
    }

    .form-group label {
      display: block;
      margin-bottom: 0.5rem;
      font-weight: 500;
    }

    .form-group input,
    .form-group textarea {
      width: 100%;
      padding: 0.75rem;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 1rem;
    }

    .form-group input:focus,
    .form-group textarea:focus {
      outline: none;
      border-color: #3498db;
    }

    button {
      width: 100%;
      padding: 0.75rem;
      background-color: #3498db;
      color: white;
      border: none;
      border-radius: 4px;
      font-size: 1rem;
      cursor: pointer;
      transition: background-color 0.3s ease;
    }

    button:hover {
      background-color: #2980b9;
    }

    /* 文章详情页 */
    .post-detail {
      background-color: #fff;
      padding: 2rem;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }

    .post-detail h1 {
      margin-bottom: 1rem;
      color: #2c3e50;
    }

    .post-meta {
      margin-bottom: 1.5rem;
      color: #7f8c8d;
      font-size: 0.9rem;
    }

    .post-content {
      line-height: 1.8;
      margin-bottom: 2rem;
    }

    .comment {
      padding: 1rem;
      border-bottom: 1px solid #eee;
    }

    .comment:last-child {
      border-bottom: none;
    }

    .comment strong {
      color: #3498db;
    }

    .comment small {
      display: block;
      color: #7f8c8d;
      margin-top: 0.5rem;
      font-size: 0.8rem;
    }

    #comment-form {
      margin-top: 2rem;
    }

    #comment-form textarea {
      width: 100%;
      padding: 1rem;
      border: 1px solid #ddd;
      border-radius: 4px;
      resize: vertical;
      min-height: 100px;
    }

    /* 发布文章页面 */
    .post-form-container {
      background-color: #fff;
      padding: 2rem;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      max-width: 600px;
      margin: 2rem auto;
    }

    .post-form-container h2 {
      margin-bottom: 1.5rem;
      color: #2c3e50;
    }

    /* 用户详情页 */
    .profile-container {
      background-color: #fff;
      padding: 2rem;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }

    .profile-container h2 {
      margin-bottom: 1.5rem;
      color: #2c3e50;
    }

    .user-info {
      margin-bottom: 2rem;
      padding: 1rem;
      background-color: #f8f9fa;
      border-radius: 4px;
    }

    .user-info p {
      margin-bottom: 0.5rem;
    }

    .male {
      color: #3498db;
    }

    .female {
      color: #e74c3c;
    }

    .role-badge {
      padding: 0.2rem 0.5rem;
      border-radius: 4px;
      font-size: 0.8rem;
      font-weight: bold;
    }

    .role-badge.admin {
      background-color: #000;
      color: #fff;
    }

    .role-badge.founder {
      background-color: #e74c3c;
      color: #fff;
    }

    .role-badge.member {
      color: #e74c3c;
    }

    .user-posts {
      margin-top: 2rem;
    }

    .post-preview {
      padding: 0.5rem;
      border-bottom: 1px solid #eee;
    }

    .post-preview:last-child {
      border-bottom: none;
    }

    .post-preview a {
      color: #3498db;
      text-decoration: none;
    }

    .post-preview a:hover {
      text-decoration: underline;
    }

    .post-date {
      display: block;
      font-size: 0.8rem;
      color: #7f8c8d;
      margin-top: 0.2rem;
    }

    /* 底部 */
    footer {
      text-align: center;
      padding: 2rem;
      background-color: #fff;
      border-top: 1px solid #eee;
      margin-top: 2rem;
    }

    footer a {
      color: #3498db;
      text-decoration: none;
    }

    footer a:hover {
      text-decoration: underline;
    }

    /* 响应式设计 */
    @media (max-width: 768px) {
      header {
        padding: 1rem;
      }
      
      nav {
        flex-direction: column;
        gap: 0.5rem;
      }
      
      main {
        margin: 1rem auto;
        padding: 0 0.5rem;
      }
      
      .post-item {
        padding: 1rem;
      }
      
      .auth-container,
      .post-form-container,
      .profile-container {
        padding: 1rem;
      }
      
      .pagination {
        gap: 0.25rem;
      }
      
      .pagination a,
      .pagination span {
        padding: 0.25rem 0.5rem;
        font-size: 0.9rem;
      }
    }
  </style>
</head>
<body>
  <header>
    <h1>曦月的小窝</h1>
    <nav>
      <a href="/login">登录</a> | 
      <a href="/register">注册</a> | 
      <span>🔍搜索帖子</span>
    </nav>
  </header>
  
  <main>
    ${posts.map(post => `
      <article class="post-item">
        <h2><a href="/post?id=${post.id}">${post.title}</a></h2>
        <div class="post-meta">
          <span>字数: ${post.content.length}</span> |
          <span>发布时间: ${formatDate(post.time)}</span> |
          <span>阅读: ${post.views}</span>
        </div>
        <div class="post-content">
          ${post.content.substring(0, 150)}...
        </div>
        <div class="post-actions">
          <a href="/post?id=${post.id}#comments">评论区</a>
        </div>
      </article>
    `).join('')}
    
    <!-- 分页 -->
    <div class="pagination">
      ${page > 1 ? `<a href="?page=${page - 1}">&laquo; 上一页</a>` : ''}
      ${Array.from({length: totalPages}, (_, i) => i + 1)
        .map(p => 
          p === page ? `<span class="current-page">${p}</span>` : 
          `<a href="?page=${p}">${p}</a>`
        ).join(' ')
      }
      ${page < totalPages ? `<a href="?page=${page + 1}">下一页 &raquo;</a>` : ''}
    </div>
  </main>
  
  <footer>
    <p>&copy; 2023 曦月的小窝</p>
    <p><a href="/rss.xml">RSS订阅</a></p>
  </footer>
</body>
</html>
`;

  return new Response(html, { headers: { "Content-Type": "text/html;charset=UTF-8" } });
}

// 登录页面
function loginPage(env) {
  const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>登录 - 曦月的小窝</title>
  <style>
    /* 全局样式 */
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      line-height: 1.6;
      color: #333;
      background-color: #f5f5f5;
    }

    header {
      background-color: #fff;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      padding: 1rem 2rem;
      position: sticky;
      top: 0;
      z-index: 100;
    }

    header h1 {
      color: #2c3e50;
      margin-bottom: 0.5rem;
    }

    nav {
      display: flex;
      gap: 1rem;
      align-items: center;
    }

    nav a {
      text-decoration: none;
      color: #3498db;
      font-weight: 500;
    }

    nav a:hover {
      color: #2980b9;
    }

    main {
      max-width: 800px;
      margin: 2rem auto;
      padding: 0 1rem;
    }

    /* 登录/注册表单 */
    .auth-container {
      background-color: #fff;
      padding: 2rem;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      max-width: 400px;
      margin: 2rem auto;
    }

    .auth-container h2 {
      text-align: center;
      margin-bottom: 1.5rem;
      color: #2c3e50;
    }

    .form-group {
      margin-bottom: 1rem;
    }

    .form-group label {
      display: block;
      margin-bottom: 0.5rem;
      font-weight: 500;
    }

    .form-group input,
    .form-group textarea {
      width: 100%;
      padding: 0.75rem;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 1rem;
    }

    .form-group input:focus,
    .form-group textarea:focus {
      outline: none;
      border-color: #3498db;
    }

    button {
      width: 100%;
      padding: 0.75rem;
      background-color: #3498db;
      color: white;
      border: none;
      border-radius: 4px;
      font-size: 1rem;
      cursor: pointer;
      transition: background-color 0.3s ease;
    }

    button:hover {
      background-color: #2980b9;
    }

    footer {
      text-align: center;
      padding: 2rem;
      background-color: #fff;
      border-top: 1px solid #eee;
      margin-top: 2rem;
    }

    footer a {
      color: #3498db;
      text-decoration: none;
    }

    footer a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <header>
    <h1>曦月的小窝</h1>
    <nav>
      <a href="/">首页</a> | 
      <a href="/register">注册</a>
    </nav>
  </header>
  
  <main>
    <div class="auth-container">
      <h2>用户登录</h2>
      <form id="loginForm" method="post" action="/api/login">
        <div class="form-group">
          <label for="username">用户名:</label>
          <input type="text" id="username" name="username" required>
        </div>
        <div class="form-group">
          <label for="password">密码:</label>
          <input type="password" id="password" name="password" required>
        </div>
        <button type="submit">登录</button>
      </form>
      <p><a href="/register">没有账户？立即注册</a></p>
    </div>
  </main>
  
  <footer>
    <p>&copy; 2023 曦月的小窝</p>
  </footer>
  
  <script>
    document.getElementById('loginForm').addEventListener('submit', function(e) {
      e.preventDefault();
      const formData = new FormData(this);
      fetch('/api/login', {
        method: 'POST',
        body: formData
      })
      .then(response => response.text())
      .then(data => {
        alert(data);
        if (data.includes('成功')) {
          window.location.href = '/';
        }
      })
      .catch(error => {
        console.error('Error:', error);
        alert('登录失败，请稍后重试');
      });
    });
  </script>
</body>
</html>
`;

  return new Response(html, { headers: { "Content-Type": "text/html;charset=UTF-8" } });
}

// 注册页面
function registerPage(env) {
  const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>注册 - 曦月的小窝</title>
  <style>
    /* 全局样式 */
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      line-height: 1.6;
      color: #333;
      background-color: #f5f5f5;
    }

    header {
      background-color: #fff;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      padding: 1rem 2rem;
      position: sticky;
      top: 0;
      z-index: 100;
    }

    header h1 {
      color: #2c3e50;
      margin-bottom: 0.5rem;
    }

    nav {
      display: flex;
      gap: 1rem;
      align-items: center;
    }

    nav a {
      text-decoration: none;
      color: #3498db;
      font-weight: 500;
    }

    nav a:hover {
      color: #2980b9;
    }

    main {
      max-width: 800px;
      margin: 2rem auto;
      padding: 0 1rem;
    }

    /* 登录/注册表单 */
    .auth-container {
      background-color: #fff;
      padding: 2rem;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      max-width: 400px;
      margin: 2rem auto;
    }

    .auth-container h2 {
      text-align: center;
      margin-bottom: 1.5rem;
      color: #2c3e50;
    }

    .form-group {
      margin-bottom: 1rem;
    }

    .form-group label {
      display: block;
      margin-bottom: 0.5rem;
      font-weight: 500;
    }

    .form-group input,
    .form-group textarea {
      width: 100%;
      padding: 0.75rem;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 1rem;
    }

    .form-group input:focus,
    .form-group textarea:focus {
      outline: none;
      border-color: #3498db;
    }

    button {
      width: 100%;
      padding: 0.75rem;
      background-color: #3498db;
      color: white;
      border: none;
      border-radius: 4px;
      font-size: 1rem;
      cursor: pointer;
      transition: background-color 0.3s ease;
    }

    button:hover {
      background-color: #2980b9;
    }

    footer {
      text-align: center;
      padding: 2rem;
      background-color: #fff;
      border-top: 1px solid #eee;
      margin-top: 2rem;
    }

    footer a {
      color: #3498db;
      text-decoration: none;
    }

    footer a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <header>
    <h1>曦月的小窝</h1>
    <nav>
      <a href="/">首页</a> | 
      <a href="/login">登录</a>
    </nav>
  </header>
  
  <main>
    <div class="auth-container">
      <h2>用户注册</h2>
      <form id="registerForm" method="post" action="/api/register">
        <div class="form-group">
          <label for="nickname">昵称:</label>
          <input type="text" id="nickname" name="nickname" required>
        </div>
        <div class="form-group">
          <label for="username">用户名:</label>
          <input type="text" id="username" name="username" required>
        </div>
        <div class="form-group">
          <label for="password">密码:</label>
          <input type="password" id="password" name="password" required>
        </div>
        <div class="form-group">
          <label for="invite">邀请码:</label>
          <input type="text" id="invite" name="invite" required>
        </div>
        <div class="form-group">
          <label>性别:</label>
          <label><input type="radio" name="gender" value="♂" checked> 男</label>
          <label><input type="radio" name="gender" value="♀"> 女</label>
        </div>
        <div class="form-group">
          <label for="bio">个人简介:</label>
          <textarea id="bio" name="bio"></textarea>
        </div>
        <button type="submit">注册</button>
      </form>
      <p><a href="/login">已有账户？立即登录</a></p>
    </div>
  </main>
  
  <footer>
    <p>&copy; 2023 曦月的小窝</p>
  </footer>
  
  <script>
    document.getElementById('registerForm').addEventListener('submit', function(e) {
      e.preventDefault();
      const formData = new FormData(this);
      fetch('/api/register', {
        method: 'POST',
        body: formData
      })
      .then(response => response.text())
      .then(data => {
        alert(data);
        if (data.includes('成功')) {
          window.location.href = '/login';
        }
      })
      .catch(error => {
        console.error('Error:', error);
        alert('注册失败，请稍后重试');
      });
    });
  </script>
</body>
</html>
`;

  return new Response(html, { headers: { "Content-Type": "text/html;charset=UTF-8" } });
}

// 文章详情页
async function postPage(env, params) {
  const id = params.get('id');
  if (!id) {
    return new Response("文章ID无效", { status: 400 });
  }
  
  const post = await getPostById(env, id);
  if (!post) {
    return new Response("文章未找到", { status: 404 });
  }
  
  // 更新阅读次数
  post.views += 1;
  await savePost(env, post);
  
  const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${post.title} - 曦月的小窝</title>
  <style>
    /* 全局样式 */
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      line-height: 1.6;
      color: #333;
      background-color: #f5f5f5;
    }

    header {
      background-color: #fff;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      padding: 1rem 2rem;
      position: sticky;
      top: 0;
      z-index: 100;
    }

    header h1 {
      color: #2c3e50;
      margin-bottom: 0.5rem;
    }

    nav {
      display: flex;
      gap: 1rem;
      align-items: center;
    }

    nav a {
      text-decoration: none;
      color: #3498db;
      font-weight: 500;
    }

    nav a:hover {
      color: #2980b9;
    }

    main {
      max-width: 800px;
      margin: 2rem auto;
      padding: 0 1rem;
    }

    /* 文章详情页 */
    .post-detail {
      background-color: #fff;
      padding: 2rem;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }

    .post-detail h1 {
      margin-bottom: 1rem;
      color: #2c3e50;
    }

    .post-meta {
      margin-bottom: 1.5rem;
      color: #7f8c8d;
      font-size: 0.9rem;
    }

    .post-content {
      line-height: 1.8;
      margin-bottom: 2rem;
    }

    .comment {
      padding: 1rem;
      border-bottom: 1px solid #eee;
    }

    .comment:last-child {
      border-bottom: none;
    }

    .comment strong {
      color: #3498db;
    }

    .comment small {
      display: block;
      color: #7f8c8d;
      margin-top: 0.5rem;
      font-size: 0.8rem;
    }

    #comment-form {
      margin-top: 2rem;
    }

    #comment-form textarea {
      width: 100%;
      padding: 1rem;
      border: 1px solid #ddd;
      border-radius: 4px;
      resize: vertical;
      min-height: 100px;
    }

    footer {
      text-align: center;
      padding: 2rem;
      background-color: #fff;
      border-top: 1px solid #eee;
      margin-top: 2rem;
    }

    footer a {
      color: #3498db;
      text-decoration: none;
    }

    footer a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <header>
    <h1>曦月的小窝</h1>
    <nav>
      <a href="/">首页</a> | 
      <a href="/login">登录</a> | 
      <a href="/register">注册</a>
    </nav>
  </header>
  
  <main>
    <article class="post-detail">
      <h1>${post.title}</h1>
      <div class="post-meta">
        <span>字数: ${post.content.length}</span> |
        <span>发布时间: ${formatDate(post.time)}</span> |
        <span>阅读: ${post.views}</span>
      </div>
      <div class="post-content">
        ${post.content.replace(/\n/g, '<br>')}
      </div>
      
      <section id="comments">
        <h3>评论区</h3>
        <div id="comments-list">
          ${post.comments && post.comments.length > 0 
            ? post.comments.map(comment => `
              <div class="comment">
                <strong>${comment.author}</strong>: ${comment.text}
                <small>${formatDate(comment.time)}</small>
              </div>
            `).join('')
            : '<p>暂无评论</p>'
          }
        </div>
        <form id="comment-form">
          <textarea name="text" placeholder="写下你的评论..." required></textarea>
          <button type="submit">发表评论</button>
        </form>
      </section>
    </article>
  </main>
  
  <footer>
    <p>&copy; 2023 曦月的小窝</p>
    <p><a href="/rss.xml">RSS订阅</a></p>
  </footer>
  
  <script>
    document.getElementById('comment-form').addEventListener('submit', function(e) {
      e.preventDefault();
      const formData = new FormData(this);
      formData.append('postId', '${post.id}');
      fetch('/api/add-comment', {
        method: 'POST',
        body: formData
      })
      .then(response => response.text())
      .then(data => {
        alert(data);
        if (data.includes('成功')) {
          window.location.reload();
        }
      })
      .catch(error => {
        console.error('Error:', error);
        alert('评论失败，请稍后重试');
      });
    });
  </script>
</body>
</html>
`;

  return new Response(html, { headers: { "Content-Type": "text/html;charset=UTF-8" } });
}

// 发布文章页面
function createPostPage(env) {
  const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>发布文章 - 曦月的小窝</title>
  <style>
    /* 全局样式 */
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      line-height: 1.6;
      color: #333;
      background-color: #f5f5f5;
    }

    header {
      background-color: #fff;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      padding: 1rem 2rem;
      position: sticky;
      top: 0;
      z-index: 100;
    }

    header h1 {
      color: #2c3e50;
      margin-bottom: 0.5rem;
    }

    nav {
      display: flex;
      gap: 1rem;
      align-items: center;
    }

    nav a {
      text-decoration: none;
      color: #3498db;
      font-weight: 500;
    }

    nav a:hover {
      color: #2980b9;
    }

    main {
      max-width: 800px;
      margin: 2rem auto;
      padding: 0 1rem;
    }

    /* 发布文章页面 */
    .post-form-container {
      background-color: #fff;
      padding: 2rem;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      max-width: 600px;
      margin: 2rem auto;
    }

    .post-form-container h2 {
      margin-bottom: 1.5rem;
      color: #2c3e50;
    }

    .form-group {
      margin-bottom: 1rem;
    }

    .form-group label {
      display: block;
      margin-bottom: 0.5rem;
      font-weight: 500;
    }

    .form-group input,
    .form-group textarea {
      width: 100%;
      padding: 0.75rem;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 1rem;
    }

    .form-group input:focus,
    .form-group textarea:focus {
      outline: none;
      border-color: #3498db;
    }

    button {
      width: 100%;
      padding: 0.75rem;
      background-color: #3498db;
      color: white;
      border: none;
      border-radius: 4px;
      font-size: 1rem;
      cursor: pointer;
      transition: background-color 0.3s ease;
    }

    button:hover {
      background-color: #2980b9;
    }

    footer {
      text-align: center;
      padding: 2rem;
      background-color: #fff;
      border-top: 1px solid #eee;
      margin-top: 2rem;
    }

    footer a {
      color: #3498db;
      text-decoration: none;
    }

    footer a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <header>
    <h1>曦月的小窝</h1>
    <nav>
      <a href="/">首页</a> | 
      <a href="/login">登录</a>
    </nav>
  </header>
  
  <main>
    <div class="post-form-container">
      <h2>发布新文章</h2>
      <form id="createPostForm" method="post" action="/api/create-post">
        <div class="form-group">
          <label for="title">标题:</label>
          <input type="text" id="title" name="title" required>
        </div>
        <div class="form-group">
          <label for="image">配图URL (可选):</label>
          <input type="url" id="image" name="image">
        </div>
        <div class="form-group">
          <label for="content">正文:</label>
          <textarea id="content" name="content" rows="10" required></textarea>
        </div>
        <button type="submit">发布</button>
      </form>
    </div>
  </main>
  
  <footer>
    <p>&copy; 2023 曦月的小窝</p>
  </footer>
  
  <script>
    document.getElementById('createPostForm').addEventListener('submit', function(e) {
      e.preventDefault();
      const formData = new FormData(this);
      fetch('/api/create-post', {
        method: 'POST',
        body: formData
      })
      .then(response => response.text())
      .then(data => {
        alert(data);
        if (data.includes('成功')) {
          window.location.href = '/';
        }
      })
      .catch(error => {
        console.error('Error:', error);
        alert('发布失败，请稍后重试');
      });
    });
  </script>
</body>
</html>
`;

  return new Response(html, { headers: { "Content-Type": "text/html;charset=UTF-8" } });
}

// 用户详情页
async function profilePage(env, params) {
  const username = params.get('username');
  if (!username) {
    return new Response("用户名无效", { status: 400 });
  }
  
  const user = await getUser(env, username);
  if (!user) {
    return new Response("用户未找到", { status: 404 });
  }
  
  const posts = await getUserPosts(env, username);
  
  const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${user.nickname} - 用户详情</title>
  <style>
    /* 全局样式 */
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      line-height: 1.6;
      color: #333;
      background-color: #f5f5f5;
    }

    header {
      background-color: #fff;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      padding: 1rem 2rem;
      position: sticky;
      top: 0;
      z-index: 100;
    }

    header h1 {
      color: #2c3e50;
      margin-bottom: 0.5rem;
    }

    nav {
      display: flex;
      gap: 1rem;
      align-items: center;
    }

    nav a {
      text-decoration: none;
      color: #3498db;
      font-weight: 500;
    }

    nav a:hover {
      color: #2980b9;
    }

    main {
      max-width: 800px;
      margin: 2rem auto;
      padding: 0 1rem;
    }

    /* 用户详情页 */
    .profile-container {
      background-color: #fff;
      padding: 2rem;
      border-radius: 8px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }

    .profile-container h2 {
      margin-bottom: 1.5rem;
      color: #2c3e50;
    }

    .user-info {
      margin-bottom: 2rem;
      padding: 1rem;
      background-color: #f8f9fa;
      border-radius: 4px;
    }

    .user-info p {
      margin-bottom: 0.5rem;
    }

    .male {
      color: #3498db;
    }

    .female {
      color: #e74c3c;
    }

    .role-badge {
      padding: 0.2rem 0.5rem;
      border-radius: 4px;
      font-size: 0.8rem;
      font-weight: bold;
    }

    .role-badge.admin {
      background-color: #000;
      color: #fff;
    }

    .role-badge.founder {
      background-color: #e74c3c;
      color: #fff;
    }

    .role-badge.member {
      color: #e74c3c;
    }

    .user-posts {
      margin-top: 2rem;
    }

    .post-preview {
      padding: 0.5rem;
      border-bottom: 1px solid #eee;
    }

    .post-preview:last-child {
      border-bottom: none;
    }

    .post-preview a {
      color: #3498db;
      text-decoration: none;
    }

    .post-preview a:hover {
      text-decoration: underline;
    }

    .post-date {
      display: block;
      font-size: 0.8rem;
      color: #7f8c8d;
      margin-top: 0.2rem;
    }

    footer {
      text-align: center;
      padding: 2rem;
      background-color: #fff;
      border-top: 1px solid #eee;
      margin-top: 2rem;
    }

    footer a {
      color: #3498db;
      text-decoration: none;
    }

    footer a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <header>
    <h1>曦月的小窝</h1>
    <nav>
      <a href="/">首页</a> | 
      <a href="/login">登录</a>
    </nav>
  </header>
  
  <main>
    <div class="profile-container">
      <h2>${user.nickname}</h2>
      <div class="user-info">
        <p><strong>用户名:</strong> ${user.username}</p>
        <p><strong>注册时间:</strong> ${formatDate(user.created)}</p>
        <p><strong>最后活跃:</strong> ${formatDate(user.active)}</p>
        <p><strong>性别:</strong> <span class="${user.gender === '♂' ? 'male' : 'female'}">${user.gender}</span></p>
        <p><strong>个人简介:</strong> ${user.bio || '暂无简介'}</p>
        <p><strong>头衔:</strong> 
          ${getRoleBadge(user.role)}
        </p>
      </div>
      
      <h3>全部文章</h3>
      <div class="user-posts">
        ${posts.map(post => `
          <div class="post-preview">
            <a href="/post?id=${post.id}">${post.title}</a>
            <span class="post-date">${formatDate(post.time)}</span>
          </div>
        `).join('')}
      </div>
    </div>
  </main>
  
  <footer>
    <p>&copy; 2023 曦月的小窝</p>
  </footer>
</body>
</html>
`;

  return new Response(html, { headers: { "Content-Type": "text/html;charset=UTF-8" } });
}

// RSS 订阅
async function rssFeed(env) {
  let posts = await getPosts(env);
  posts = posts.slice(0, 20); // 最多20篇文章
  
  let rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
<channel>
<title>曦月的小窝</title>
<link>https://your-blog-url.com</link>
<description>曦月的个人博客</description>
<language>zh-CN</language>
${posts.map(post => `
<item>
<title>${escapeXml(post.title)}</title>
<description>${escapeXml(post.content.substring(0, 200))}</description>
<link>https://your-blog-url.com/post?id=${post.id}</link>
<pubDate>${new Date(post.time).toUTCString()}</pubDate>
</item>
`).join('')}
</channel>
</rss>`;
  
  return new Response(rss, { 
    headers: { 
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600"
    } 
  });
}

// API 处理
async function handleAPI(request, env, url) {
  const path = url.pathname;
  const method = request.method;
  
  if (method === "POST") {
    const formData = await request.formData();
    
    switch (path) {
      case "/api/login":
        return login(env, formData);
      case "/api/register":
        return register(env, formData);
      case "/api/create-post":
        return createPost(env, formData);
      case "/api/add-comment":
        return addComment(env, formData);
      case "/api/admin/ban-user":
        return banUser(env, formData);
      case "/api/admin/delete-post":
        return deletePost(env, formData);
      case "/api/admin/set-admin":
        return setAdmin(env, formData);
      case "/api/admin/reset-password":
        return resetPassword(env, formData);
      case "/api/admin/create-user":
        return createUser(env, formData);
      case "/api/admin/set-invite":
        return setInvite(env, formData);
      case "/api/admin/mute-user":
        return muteUser(env, formData);
      case "/api/admin/delete-user":
        return deleteUser(env, formData);
      default:
        return new Response("未知API", { status: 404 });
    }
  }
  
  return new Response("Method Not Allowed", { status: 405 });
}

// 工具函数
function formatDate(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).replace(/\//g, '-');
}

function escapeXml(unsafe) {
  return unsafe.replace(/[<>&'"]/g, function (c) {
    return {
      '<': '<',
      '>': '>',
      '&': '&amp;',
      "'": '&apos;',
      '"': '&quot;'
    }[c];
  });
}

function getRoleBadge(role) {
  switch(role) {
    case "admin":
      return '<span class="role-badge admin">管理员</span>';
    case "founder":
      return '<span class="role-badge founder">创始人</span>';
    default:
      return '<span class="role-badge member">注册会员</span>';
  }
}

// 数据访问函数
async function getPosts(env) {
  let list = await env.BLOG_DATA_STORE.list({ prefix: "post:" });
  let keys = list.keys.map(k => k.name);
  let results = await Promise.all(keys.map(k => env.BLOG_DATA_STORE.get(k)));
  return results
    .map((val, i) => ({ id: keys[i].split(":")[1], ...JSON.parse(val) }))
    .sort((a, b) => b.time - a.time);
}

async function getPostById(env, id) {
  let data = await env.BLOG_DATA_STORE.get(`post:${id}`);
  return data ? JSON.parse(data) : null;
}

async function savePost(env, post) {
  await env.BLOG_DATA_STORE.put(`post:${post.id}`, JSON.stringify(post));
}

async function getUser(env, username) {
  let data = await env.BLOG_DATA_STORE.get(`user:${username}`);
  return data ? JSON.parse(data) : null;
}

async function setUser(env, username, userData) {
  await env.BLOG_DATA_STORE.put(`user:${username}`, JSON.stringify(userData));
}

async function getUserPosts(env, username) {
  let posts = await getPosts(env);
  return posts.filter(post => post.author === username);
}

// 登录处理
async function login(env, formData) {
  const username = formData.get("username");
  const password = formData.get("password");
  
  const user = await getUser(env, username);
  if (!user) {
    return new Response("用户不存在", { status: 400 });
  }
  
  if (user.password !== password) {
    return new Response("密码错误", { status: 400 });
  }
  
  if (user.banned) {
    return new Response("账户已被封禁", { status: 403 });
  }
  
  if (user.muted) {
    return new Response("账户已被禁言", { status: 403 });
  }
  
  // 更新最后活跃时间
  user.active = Date.now();
  await setUser(env, username, user);
  
  return new Response("登录成功");
}

// 注册处理
async function register(env, formData) {
  const nickname = formData.get("nickname");
  const username = formData.get("username");
  const password = formData.get("password");
  const invite = formData.get("invite");
  const gender = formData.get("gender");
  const bio = formData.get("bio");
  
  // 验证邀请码
  const validInvite = await env.BLOG_DATA_STORE.get(`invite:${invite}`);
  if (!validInvite) {
    return new Response("邀请码无效", { status: 400 });
  }
  
  // 检查用户名是否已存在
  const existingUser = await getUser(env, username);
  if (existingUser) {
    return new Response("用户名已存在", { status: 400 });
  }
  
  // 创建新用户
  const newUser = {
    nickname,
    username,
    password,
    gender,
    bio,
    role: "user",
    banned: false,
    muted: false,
    avatar: "",
    active: Date.now(),
    created: Date.now()
  };
  
  await setUser(env, username, newUser);
  
  return new Response("注册成功");
}

// 发布文章
async function createPost(env, formData) {
  const title = formData.get("title");
  const image = formData.get("image");
  const content = formData.get("content");
  
  // 简单验证
  if (!title || !content) {
    return new Response("标题和内容不能为空", { status: 400 });
  }
  
  // 获取当前用户
  const user = await getUser(env, "xiyue"); // 这里应该从cookie中获取
  if (!user) {
    return new Response("请先登录", { status: 401 });
  }
  
  const id = crypto.randomUUID();
  const newPost = {
    id,
    title,
    image,
    content,
    author: user.username,
    time: Date.now(),
    views: 0,
    comments: []
  };
  
  await savePost(env, newPost);
  
  return new Response("文章发布成功");
}

// 添加评论
async function addComment(env, formData) {
  const postId = formData.get("postId");
  const text = formData.get("text");
  
  if (!postId || !text) {
    return new Response("参数错误", { status: 400 });
  }
  
  const post = await getPostById(env, postId);
  if (!post) {
    return new Response("文章不存在", { status: 404 });
  }
  
  // 简单验证用户权限
  const user = await getUser(env, "xiyue"); // 应从cookie中获取
  if (!user) {
    return new Response("请先登录", { status: 401 });
  }
  
  if (user.muted) {
    return new Response("您已被禁言", { status: 403 });
  }
  
  const comment = {
    author: user.username,
    text,
    time: Date.now()
  };
  
  post.comments.push(comment);
  await savePost(env, post);
  
  return new Response("评论成功");
}

// 管理员操作

async function banUser(env, formData) {
  const target = formData.get("target");
  const action = formData.get("action"); // ban 或 unban
  
  const user = await getUser(env, target);
  if (!user) {
    return new Response("用户不存在", { status: 404 });
  }
  
  // 系统管理员不能被封禁
  if (user.username === "xiyue") {
    return new Response("无法对系统管理员执行此操作", { status: 403 });
  }
  
  user.banned = action === "ban";
  await setUser(env, target, user);
  
  return new Response("操作成功");
}

async function deletePost(env, formData) {
  const postId = formData.get("postId");
  
  const post = await getPostById(env, postId);
  if (!post) {
    return new Response("文章不存在", { status: 404 });
  }
  
  await env.BLOG_DATA_STORE.delete(`post:${postId}`);
  
  return new Response("删除成功");
}

async function setAdmin(env, formData) {
  const target = formData.get("target");
  const action = formData.get("action"); // set 或 unset
  
  const user = await getUser(env, target);
  if (!user) {
    return new Response("用户不存在", { status: 404 });
  }
  
  // 系统管理员不能被更改
  if (user.username === "xiyue") {
    return new Response("无法修改系统管理员", { status: 403 });
  }
  
  user.role = action === "set" ? "admin" : "user";
  await setUser(env, target, user);
  
  return new Response("操作成功");
}

async function resetPassword(env, formData) {
  const target = formData.get("target");
  const newPassword = formData.get("newPassword");
  
  const user = await getUser(env, target);
  if (!user) {
    return new Response("用户不存在", { status: 404 });
  }
  
  user.password = newPassword;
  await setUser(env, target, user);
  
  return new Response("密码重置成功");
}

async function createUser(env, formData) {
  const username = formData.get("username");
  const password = formData.get("password");
  const nickname = formData.get("nickname");
  const gender = formData.get("gender");
  
  // 检查用户名是否已存在
  const existingUser = await getUser(env, username);
  if (existingUser) {
    return new Response("用户名已存在", { status: 400 });
  }
  
  const newUser = {
    nickname,
    username,
    password,
    gender,
    bio: "",
    role: "user",
    banned: false,
    muted: false,
    avatar: "",
    active: Date.now(),
    created: Date.now()
  };
  
  await setUser(env, username, newUser);
  
  return new Response("用户创建成功");
}

async function setInvite(env, formData) {
  const code = formData.get("code");
  const enabled = formData.get("enabled") === "true";
  
  if (enabled) {
    await env.BLOG_DATA_STORE.put(`invite:${code}`, "true");
  } else {
    await env.BLOG_DATA_STORE.delete(`invite:${code}`);
  }
  
  return new Response("邀请码设置成功");
}

async function muteUser(env, formData) {
  const target = formData.get("target");
  const action = formData.get("action"); // mute 或 unmute
  
  const user = await getUser(env, target);
  if (!user) {
    return new Response("用户不存在", { status: 404 });
  }
  
  // 系统管理员不能被禁言
  if (user.username === "xiyue") {
    return new Response("无法对系统管理员执行此操作", { status: 403 });
  }
  
  user.muted = action === "mute";
  await setUser(env, target, user);
  
  return new Response("操作成功");
}

async function deleteUser(env, formData) {
  const target = formData.get("target");
  
  const user = await getUser(env, target);
  if (!user) {
    return new Response("用户不存在", { status: 404 });
  }
  
  // 系统管理员不能被删除
  if (user.username === "xiyue") {
    return new Response("无法删除系统管理员", { status: 403 });
  }
  
  // 删除用户数据
  await env.BLOG_DATA_STORE.delete(`user:${target}`);
  
  // 删除该用户的所有文章
  const posts = await getPosts(env);
  for (const post of posts) {
    if (post.author === target) {
      await env.BLOG_DATA_STORE.delete(`post:${post.id}`);
    }
  }
  
  return new Response("用户删除成功");
}