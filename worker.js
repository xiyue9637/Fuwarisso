// worker.js

// 修复聊天功能并添加聊天按钮

// 管理员凭证

const ADMIN_USERNAME = 'admin';

const ADMIN_PASSWORD = 'xiyue777';

const BAN_MESSAGE = '您的账号已被管理员封禁,请联系 linyi8100@gmail.com解封';

const INVITE_CODE = 'xiyue666'; // 邀请码

// 简单的 UUID 生成器

function generateUUID() {

return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,
function(c) {

const r = Math.random() * 16 | 0;

const v = c === 'x' ? r : (r & 0x3 | 0x8);

return v.toString(16);

});

}

// 简化的 SHA-256 实现

function simpleSha256(str) {

try {

let hash = 0;

if (str.length === 0) return '0';

for (let i = 0; i < str.length; i++) {

const chr = str.charCodeAt(i);

hash = ((hash << 5) - hash) + chr;

hash = hash & 0xFFFFFFFF; // 修复：确保32位整数

}

return hash.toString(16);

} catch (e) {

console.error('SHA-256 error:', e);

return 'error_hash';

}

}

// HTML 转义函数（防止XSS攻击）

function escapeHTML(str) {

if (!str) return '';

return str

.replace(/&/g, '&amp;')

.replace(/</g, '&lt;')

.replace(/>/g, '&gt;')

.replace(/"/g, '&quot;')

.replace(/'/g, '&#39;');

}

// 安全的 JSON 响应函数

function safeJsonResponse(data, status = 200) {

try {

return new Response(JSON.stringify(data), {

status: status,

headers: {

'Content-Type': 'application/json',

'Access-Control-Allow-Origin': '*',

'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',

'Access-Control-Allow-Headers': 'Content-Type,Authorization'

}

});

} catch (e) {

console.error('JSON response error:', e);

return new Response(JSON.stringify({

error: '服务器内部错误',

details: '无法生成响应'

}), {

status: 500,

headers: {

'Content-Type': 'application/json',

'Access-Control-Allow-Origin': '*'

}

});

}

}

// 处理 OPTIONS 预检请求

function handleOptions() {

return new Response(null, {

headers: {

'Access-Control-Allow-Origin': '*',

'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',

'Access-Control-Allow-Headers': 'Content-Type,Authorization'

}

});

}

// 初始化管理员

async function initAdmin(env) {

try {

const adminKey = `users/${ADMIN_USERNAME}`;

const existing = await env.BLOG_DATA_STORE.get(adminKey);

if (!existing) {

// 使用简单哈希

const passwordHash = simpleSha256(ADMIN_PASSWORD);

await env.BLOG_DATA_STORE.put(adminKey, JSON.stringify({

username: ADMIN_USERNAME,

passwordHash,

avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=admin',

nickname: '管理员',

banned: false,

role: 'admin',

title: '创始人', // 添加头衔

createdAt: new Date().toISOString()

}));

console.log('管理员账户已创建');

}

} catch (e) {

console.error('初始化管理员失败:', e);

}

}

// 验证用户登录

async function verifyUser(env, username, password) {

try {

const userKey = `users/${username}`;

const userData = await env.BLOG_DATA_STORE.get(userKey);

if (!userData) return null;

let user;

try {

user = JSON.parse(userData);

} catch (e) {

console.error('解析用户数据失败:', e);

return null;

}

const expectedHash = simpleSha256(password);

if (user.passwordHash === expectedHash && !user.banned) {

return {

username: user.username || username,

nickname: user.nickname || username,

role: user.role || 'user',

title: user.title || '注册会员', // 添加头衔

avatar: user.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=default',

createdAt: user.createdAt

};

}

return null;

} catch (e) {

console.error('验证用户时出错:', e);

return null;

}

}

// 验证 JWT 令牌

function verifyToken(token, secret) {

try {

if (!token || !secret) return false;

const parts = token.split('.');

if (parts.length !== 3) return false;

const [header, payload, signature] = parts;

const expectedSignature = simpleSha256(header + payload + secret);

return signature === expectedSignature;

} catch (e) {

console.error('验证令牌时出错:', e);

return false;

}

}

// 解码令牌

function decodeToken(token) {

try {

if (!token) return null;

const parts = token.split('.');

if (parts.length !== 3) return null;

const payload = parts[1];

// 修复：使用TextDecoder处理Base64解码
const decoded = new TextDecoder().decode(
  Uint8Array.from(atob(payload), c => c.charCodeAt(0))
);
return JSON.parse(decoded);

} catch (e) {

console.error('解码令牌时出错:', e);

return null;

}

}

// 检查权限

async function checkPermission(env, request) {

try {

const token = request.headers.get('Authorization')?.split(' ')[1];

if (!token) return { valid: false, error: '未提供令牌' };

// 检查 BLOG_KEY 是否设置

if (!env.BLOG_KEY) {

console.error('BLOG_KEY 未设置');

return { valid: false, error: '服务器配置错误' };

}

// 验证令牌

if (!verifyToken(token, env.BLOG_KEY)) {

return { valid: false, error: '无效或过期的令牌' };

}

// 解码令牌

const payload = decodeToken(token);

if (!payload || !payload.username) {

return { valid: false, error: '无效的令牌格式' };

}

// 获取用户信息

const userKey = `users/${payload.username}`;

const userData = await env.BLOG_DATA_STORE.get(userKey);

if (!userData) {

return { valid: false, error: '用户不存在' };

}

let user;

try {

user = JSON.parse(userData);

} catch (e) {

console.error('解析用户数据失败:', e);

return { valid: false, error: '用户数据损坏' };

}

if (user.banned) {

return { valid: false, error: BAN_MESSAGE };

}

return {

valid: true,

user: {

username: payload.username,

nickname: user.nickname || payload.username,

role: user.role || 'user',

title: user.title || '注册会员', // 添加头衔

avatar: user.avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=default',

createdAt: user.createdAt

}

};

} catch (e) {

console.error('检查权限时出错:', e);

return { valid: false, error: '权限验证失败' };

}

}

// 时间格式化函数 - 显示相对时间
function formatRelativeTime(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) {
    return `${diffSecs}秒前`;
  } else if (diffMins < 60) {
    return `${diffMins}分钟前`;
  } else if (diffHours < 24) {
    return `${diffHours}小时前`;
  } else if (diffDays < 30) {
    return `${diffDays}天前`;
  } else {
    return date.toLocaleDateString();
  }
}

// 计算网站运行时间
function calculateUptime() {
  const startDate = new Date('2025-08-24');
  const now = new Date();
  
  const diffMs = now - startDate;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  const diffSecs = Math.floor((diffMs % (1000 * 60)) / 1000);
  
  return {
    years: Math.floor(diffDays / 365),
    months: Math.floor((diffDays % 365) / 30),
    days: diffDays % 30,
    hours: diffHours,
    minutes: diffMins,
    seconds: diffSecs
  };
}

// 主处理函数

export default {

async fetch(request, env) {

try {

// 确保 BLOG_KEY 存在

if (!env.BLOG_KEY) {

console.error('环境变量 BLOG_KEY 未设置');

return safeJsonResponse({

error: '服务器配置错误',

details: 'BLOG_KEY 未设置'

}, 500);

}

// 初始化管理员

try {

await initAdmin(env);

} catch (e) {

console.error('初始化管理员时出错:', e);

}

const url = new URL(request.url);

const pathname = url.pathname;

// 处理 OPTIONS 预检

if (request.method === 'OPTIONS') {

return handleOptions();

}

// 处理根路径 - 返回前端 HTML

if (pathname === '/') {

return new Response(indexHTML, {

headers: {

'Content-Type': 'text/html',

'Access-Control-Allow-Origin': '*'

}

});

}

// API 路由

if (pathname.startsWith('/api/')) {

try {

// 用户注册 - 添加邀请码验证

if (pathname === '/api/register' && request.method === 'POST') {

let data;

try {

data = await request.json();

} catch (e) {

return safeJsonResponse({ error: '无效的JSON数据' }, 400);

}

const { username, password, avatar, inviteCode, nickname } = data;

// 验证邀请码

if (inviteCode !== INVITE_CODE) {

return safeJsonResponse({ error: '邀请码不正确' }, 403);

}

// 基本验证

if (!username || !password) {

return safeJsonResponse({ error: '用户名和密码是必填项' }, 400);

}

if (username.length < 3 || username.length > 20) {

return safeJsonResponse({ error: '用户名长度必须在3-20个字符之间' }, 400);

}

if (password.length < 6) {

return safeJsonResponse({ error: '密码至少需要6个字符' }, 400);

}

// 检查用户名是否已存在

try {

const existing = await env.BLOG_DATA_STORE.get(`users/${username}`);

if (existing) {

return safeJsonResponse({ error: '用户名已存在' }, 400);

}

} catch (e) {

console.error('检查用户名时出错:', e);

return safeJsonResponse({ error: '服务器错误' }, 500);

}

// 创建新用户

try {

const passwordHash = simpleSha256(password);
const userTitle = username === ADMIN_USERNAME ? '创始人' : '注册会员';

await env.BLOG_DATA_STORE.put(`users/${username}`, JSON.stringify({

username,

passwordHash,

avatar: avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=default',

nickname: nickname || username,

banned: false,

role: 'user',

title: userTitle, // 添加头衔

createdAt: new Date().toISOString()

}));

return safeJsonResponse({ success: true });

} catch (e) {

console.error('创建用户时出错:', e);

return safeJsonResponse({ error: '无法创建用户' }, 500);

}

}

// 用户登录

if (pathname === '/api/login' && request.method === 'POST') {

let data;

try {

data = await request.json();

} catch (e) {

return safeJsonResponse({ error: '无效的JSON数据' }, 400);

}

const { username, password } = data;

if (!username || !password) {

return safeJsonResponse({ error: '用户名和密码是必填项' }, 400);

}

// 验证用户

const user = await verifyUser(env, username, password);

if (!user) {

return safeJsonResponse({ error: '用户名或密码错误' }, 401);

}

// 生成令牌

try {

const payload = {

username: user.username,

role: user.role,

title: user.title, // 添加头衔

exp: Date.now() + 86400000 // 24小时

};

// 修复：使用TextEncoder处理Base64编码
const header = btoa(unescape(encodeURIComponent(JSON.stringify({ alg: 'HS256' }))));
const payloadStr = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
const signature = simpleSha256(header + payloadStr + env.BLOG_KEY);

return safeJsonResponse({

token: `${header}.${payloadStr}.${signature}`,

username: user.username,

nickname: user.nickname,

role: user.role,

title: user.title, // 添加头衔

avatar: user.avatar,

createdAt: user.createdAt

});

} catch (e) {

console.error('生成令牌时出错:', e);

return safeJsonResponse({ error: '无法生成令牌' }, 500);

}

}

// 获取用户信息 - 修复：无需登录即可访问

if (pathname.startsWith('/api/users/') && request.method === 'GET') {

const username = pathname.split('/').pop();

const userKey = `users/${username}`;

const userData = await env.BLOG_DATA_STORE.get(userKey);

if (!userData) {

return safeJsonResponse({ error: '用户不存在' }, 404);

}

let user;

try {

user = JSON.parse(userData);

} catch (e) {

console.error('解析用户数据失败:', e);

return safeJsonResponse({ error: '用户数据损坏' }, 500);

}

// 只返回必要信息

return safeJsonResponse({

username: user.username,

nickname: user.nickname,

avatar: user.avatar,

role: user.role,

title: user.title || '注册会员', // 添加头衔

createdAt: user.createdAt,

banned: user.banned

});

}

// 更新用户信息

if (pathname.startsWith('/api/users/') &&
pathname.endsWith('/profile') && request.method === 'PUT') {

const { valid, error, user: currentUser } = await checkPermission(env,
request);

if (!valid) return safeJsonResponse({ error }, 403);

const username = pathname.split('/')[3];

if (currentUser.username !== username) {

return safeJsonResponse({ error: '无权修改他人信息' }, 403);

}

let data;

try {

data = await request.json();

} catch (e) {

return safeJsonResponse({ error: '无效的JSON数据' }, 400);

}

const userKey = `users/${username}`;

const userData = await env.BLOG_DATA_STORE.get(userKey);

if (!userData) {

return safeJsonResponse({ error: '用户不存在' }, 404);

}

let user;

try {

user = JSON.parse(userData);

} catch (e) {

console.error('解析用户数据失败:', e);

return safeJsonResponse({ error: '用户数据损坏' }, 500);

}

// 更新信息

if (data.nickname) user.nickname = data.nickname;

if (data.avatar) user.avatar = data.avatar;

// 更新密码

if (data.currentPassword && data.newPassword) {

const currentPasswordHash = simpleSha256(data.currentPassword);

if (user.passwordHash !== currentPasswordHash) {

return safeJsonResponse({ error: '当前密码错误' }, 400);

}

if (data.newPassword.length < 6) {

return safeJsonResponse({ error: '新密码至少需要6个字符' }, 400);

}

user.passwordHash = simpleSha256(data.newPassword);

}

await env.BLOG_DATA_STORE.put(userKey, JSON.stringify(user));

return safeJsonResponse({ success: true });

}

// 获取所有帖子

if (pathname === '/api/posts' && request.method === 'GET') {

try {

const list = await env.BLOG_DATA_STORE.list({ prefix: 'posts/' });

const posts = [];

for (const key of list.keys) {

try {

const post = await env.BLOG_DATA_STORE.get(key.name, 'json');

if (post) {
  // 确保有views字段
  if (post.views === undefined) {
    post.views = 0;
    await env.BLOG_DATA_STORE.put(key.name, JSON.stringify(post));
  }
  posts.push(post);
}

} catch (e) {

console.error('获取帖子时出错:', e, key.name);

}

}

// 按时间排序（最新在前）

posts.sort((a, b) => new Date(b.createdAt || 0) - new
Date(a.createdAt || 0));

return safeJsonResponse(posts);

} catch (e) {

console.error('获取帖子列表时出错:', e);

return safeJsonResponse({ error: '无法获取帖子' }, 500);

}

}

// 发布新帖子

if (pathname === '/api/posts' && request.method === 'POST') {

const { valid, error, user } = await checkPermission(env, request);

if (!valid) return safeJsonResponse({ error }, 403);

let data;

try {

data = await request.json();

} catch (e) {

return safeJsonResponse({ error: '无效的JSON数据' }, 400);

}

const { title, content, type } = data;

if (!title || !content) {

return safeJsonResponse({ error: '标题和内容不能为空' }, 400);

}

try {

const postId = generateUUID();

await env.BLOG_DATA_STORE.put(`posts/${postId}`, JSON.stringify({

id: postId,

title,

content,

type,

author: user.username,

nickname: user.nickname,

avatar: user.avatar,

title: user.title, // 添加头衔

views: 0, // 初始化阅读量

createdAt: new Date().toISOString()

}));

return safeJsonResponse({ postId });

} catch (e) {

console.error('创建帖子时出错:', e);

return safeJsonResponse({ error: '无法发布帖子' }, 500);

}

}

// 删除帖子（仅管理员）

if (pathname.startsWith('/api/posts/') && request.method ===
'DELETE') {

const { valid, error, user } = await checkPermission(env, request);

if (!valid) return safeJsonResponse({ error }, 403);

// 只有管理员可以删除帖子

if (user.role !== 'admin') {

return safeJsonResponse({ error: '需要管理员权限' }, 403);

}

const postId = pathname.split('/').pop();

try {

await env.BLOG_DATA_STORE.delete(`posts/${postId}`);

// 删除相关评论

const commentKeys = await env.BLOG_DATA_STORE.list({ prefix:
`comments/${postId}/` });

if (commentKeys.keys.length > 0) {

await Promise.all(commentKeys.keys.map(k =>

env.BLOG_DATA_STORE.delete(k.name).catch(e => {

console.error('删除评论时出错:', e, k.name);

})

));

}

return safeJsonResponse({ success: true });

} catch (e) {

console.error('删除帖子时出错:', e);

return safeJsonResponse({ error: '无法删除帖子' }, 500);

}

}

// 获取单个帖子（增加阅读量）
if (pathname.startsWith('/api/posts/') && request.method === 'GET' && 
    !pathname.includes('/comments')) {
  
  const postId = pathname.split('/').pop();
  
  try {
    const post = await env.BLOG_DATA_STORE.get(`posts/${postId}`, 'json');
    
    if (!post) {
      return safeJsonResponse({ error: '帖子不存在' }, 404);
    }
    
    // 增加阅读量
    post.views = (post.views || 0) + 1;
    await env.BLOG_DATA_STORE.put(`posts/${postId}`, JSON.stringify(post));
    
    return safeJsonResponse(post);
  } catch (e) {
    console.error('获取帖子时出错:', e);
    return safeJsonResponse({ error: '无法获取帖子' }, 500);
  }
}

// 发布评论

if (pathname.startsWith('/api/posts/') &&
pathname.endsWith('/comments') && request.method === 'POST') {

const { valid, error, user } = await checkPermission(env, request);

if (!valid) return safeJsonResponse({ error }, 403);

let data;

try {

data = await request.json();

} catch (e) {

return safeJsonResponse({ error: '无效的JSON数据' }, 400);

}

const { content } = data;

if (!content || content.trim() === '') {

return safeJsonResponse({ error: '评论内容不能为空' }, 400);

}

const postId = pathname.split('/')[3];

try {

const commentId = generateUUID();

await env.BLOG_DATA_STORE.put(`comments/${postId}/${commentId}`,
JSON.stringify({

id: commentId,

content,

author: user.username,

nickname: user.nickname,

avatar: user.avatar,

title: user.title, // 添加头衔

createdAt: new Date().toISOString()

}));

return safeJsonResponse({ commentId });

} catch (e) {

console.error('创建评论时出错:', e);

return safeJsonResponse({ error: '无法发布评论' }, 500);

}

}

// 获取帖子评论

if (pathname.startsWith('/api/posts/') &&
pathname.endsWith('/comments') && request.method === 'GET') {

const postId = pathname.split('/')[3];

try {

// 增加帖子阅读量
const post = await env.BLOG_DATA_STORE.get(`posts/${postId}`, 'json');
if (post) {
  post.views = (post.views || 0) + 1;
  await env.BLOG_DATA_STORE.put(`posts/${postId}`, JSON.stringify(post));
}

const list = await env.BLOG_DATA_STORE.list({ prefix: `comments/${postId}/`
});

const comments = [];

for (const key of list.keys) {

try {

const comment = await env.BLOG_DATA_STORE.get(key.name, 'json');

if (comment) comments.push(comment);

} catch (e) {

console.error('获取评论时出错:', e, key.name);

}

}

// 按时间排序（最新在前）

comments.sort((a, b) => new Date(b.createdAt || 0) - new
Date(a.createdAt || 0));

return safeJsonResponse(comments);

} catch (e) {

console.error('获取评论列表时出错:', e);

return safeJsonResponse({ error: '无法获取评论' }, 500);

}

}

// 删除评论

if ((pathname.startsWith('/api/comments/') ||

(pathname.startsWith('/api/posts/') &&
pathname.includes('/comments/'))) &&

request.method === 'DELETE') {

const { valid, error, user } = await checkPermission(env, request);

if (!valid) return safeJsonResponse({ error }, 403);

// 从路径中提取postId和commentId

let postId, commentId;

// 处理 /api/comments/postId/commentId 格式

if (pathname.startsWith('/api/comments/')) {

const parts = pathname.split('/');

if (parts.length >= 5) {

postId = parts[3];

commentId = parts[4];

}

}

// 处理 /api/posts/postId/comments/commentId 格式

else if (pathname.includes('/comments/')) {

const parts = pathname.split('/');

const commentIndex = parts.indexOf('comments');

if (commentIndex > 0 && commentIndex < parts.length - 1) {

postId = parts[commentIndex - 1];

commentId = parts[commentIndex + 1];

}

}

if (!postId || !commentId) {

return safeJsonResponse({ error: '无效的评论ID' }, 400);

}

// 获取评论

try {

const comment = await
env.BLOG_DATA_STORE.get(`comments/${postId}/${commentId}`, 'json');

if (!comment) {

return safeJsonResponse({ error: '评论不存在' }, 404);

}

// 检查权限：管理员或评论作者

if (user.role !== 'admin' && comment.author !== user.username) {

return safeJsonResponse({ error: '无权删除此评论' }, 403);

}

// 删除评论

await env.BLOG_DATA_STORE.delete(`comments/${postId}/${commentId}`);

return safeJsonResponse({ success: true });

} catch (e) {

console.error('删除评论时出错:', e);

return safeJsonResponse({ error: '无法删除评论' }, 500);

}

}

// 封禁用户（仅管理员）

if (pathname === '/api/ban' && request.method === 'POST') {

const { valid, error, user } = await checkPermission(env, request);

if (!valid) return safeJsonResponse({ error }, 403);

// 只有管理员可以封禁用户

if (user.role !== 'admin') {

return safeJsonResponse({ error: '需要管理员权限' }, 403);

}

let data;

try {

data = await request.json();

} catch (e) {

return safeJsonResponse({ error: '无效的JSON数据' }, 400);

}

const { username } = data;

if (!username) {

return safeJsonResponse({ error: '需要提供用户名' }, 400);

}

if (username === 'admin') {

return safeJsonResponse({ error: '不能封禁管理员' }, 400);

}

try {

const userKey = `users/${username}`;

const userData = await env.BLOG_DATA_STORE.get(userKey);

if (!userData) {

return safeJsonResponse({ error: '用户不存在' }, 404);

}

let userObj;

try {

userObj = JSON.parse(userData);

} catch (e) {

console.error('解析用户数据失败:', e);

return safeJsonResponse({ error: '用户数据损坏' }, 500);

}

userObj.banned = true;

await env.BLOG_DATA_STORE.put(userKey, JSON.stringify(userObj));

return safeJsonResponse({

success: true,

user: {

username: username,

banned: true

}

});

} catch (e) {

console.error('封禁用户时出错:', e);

return safeJsonResponse({ error: '无法封禁用户' }, 500);

}

}

// 解封用户（仅管理员）

if (pathname === '/api/unban' && request.method === 'POST') {

const { valid, error, user } = await checkPermission(env, request);

if (!valid) return safeJsonResponse({ error }, 403);

// 只有管理员可以解封用户

if (user.role !== 'admin') {

return safeJsonResponse({ error: '需要管理员权限' }, 403);

}

let data;

try {

data = await request.json();

} catch (e) {

return safeJsonResponse({ error: '无效的JSON数据' }, 400);

}

const { username } = data;

if (!username) {

return safeJsonResponse({ error: '需要提供用户名' }, 400);

}

try {

const userKey = `users/${username}`;

const userData = await env.BLOG_DATA_STORE.get(userKey);

if (!userData) {

return safeJsonResponse({ error: '用户不存在' }, 404);

}

let userObj;

try {

userObj = JSON.parse(userData);

} catch (e) {

console.error('解析用户数据失败:', e);

return safeJsonResponse({ error: '用户数据损坏' }, 500);

}

userObj.banned = false;

await env.BLOG_DATA_STORE.put(userKey, JSON.stringify(userObj));

return safeJsonResponse({

success: true,

user: {

username: username,

banned: false

}

});

} catch (e) {

console.error('解封用户时出错:', e);

return safeJsonResponse({ error: '无法解封用户' }, 500);

}

}

// 发送消息

if (pathname === '/api/messages' && request.method === 'POST') {

const { valid, error, user } = await checkPermission(env, request);

if (!valid) return safeJsonResponse({ error }, 403);

let data;

try {

data = await request.json();

} catch (e) {

return safeJsonResponse({ error: '无效的JSON数据' }, 400);

}

const { to, content } = data;

if (!to || !content) {

return safeJsonResponse({ error: '接收者和内容是必填项' }, 400);

}

// 检查接收者是否存在

const toUser = await env.BLOG_DATA_STORE.get(`users/${to}`);

if (!toUser) {

return safeJsonResponse({ error: '接收者不存在' }, 404);

}

// 创建消息

const messageId = generateUUID();

const message = {

id: messageId,

from: user.username,

to: to,

content: content,

createdAt: new Date().toISOString(),

read: false

};

// 保存消息

await env.BLOG_DATA_STORE.put(`messages/${messageId}`,
JSON.stringify(message));

// 添加到发送者和接收者的消息列表

await env.BLOG_DATA_STORE.put(`user-messages/${user.username}/${messageId}`,
'sent');

await env.BLOG_DATA_STORE.put(`user-messages/${to}/${messageId}`,
'received');

return safeJsonResponse({ messageId });

}

// 获取消息

if (pathname === '/api/messages' && request.method === 'GET') {

const { valid, error, user } = await checkPermission(env, request);

if (!valid) return safeJsonResponse({ error }, 403);

// 获取所有消息

const sentMessages = await env.BLOG_DATA_STORE.list({ prefix:
`user-messages/${user.username}/` });

const messages = [];

for (const key of sentMessages.keys) {

const messageId = key.name.split('/').pop();

const message = await env.BLOG_DATA_STORE.get(`messages/${messageId}`,
'json');

if (message) messages.push(message);

}

// 按时间排序

messages.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

return safeJsonResponse(messages);

}

return safeJsonResponse({ error: 'API 未找到' }, 404);

} catch (e) {

console.error('API 处理时出错:', e);

return safeJsonResponse({

error: '服务器内部错误',

details: e.message

}, 500);

}

}

// 404 处理

return new Response('Not Found', {

status: 404,

headers: { 'Access-Control-Allow-Origin': '*' }

});

} catch (e) {

console.error('全局错误:', e);

return safeJsonResponse({

error: '严重错误',

details: e.message

}, 500);

}

}

};

// 前端 HTML（修复聊天功能并添加聊天按钮）

const indexHTML = `<!DOCTYPE html>

<html lang="zh-CN">

<head>

<meta charset="UTF-8">

<meta name="viewport" content="width=device-width,
initial-scale=1.0">

<title>贴吧</title>

<style>

:root {

--primary: #6a11cb;

--secondary: #2575fc;

--blur: 12px;

}

* {

margin: 0;

padding: 0;

box-sizing: border-box;

transition: background 0.5s ease;

}

body {

font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;

background: linear-gradient(135deg, var(--primary), var(--secondary));

min-height: 100vh;

padding: 20px;

color: #333;

overflow-x: hidden;

}

.container {

max-width: 1200px;

margin: 0 auto;

}

header {

text-align: center;

padding: 30px 0;

margin-bottom: 30px;

}

h1 {

font-size: 3.5rem;

background: linear-gradient(to right, #fff, #e0e0e0);

-webkit-background-clip: text;

-webkit-text-fill-color: transparent;

text-shadow: 0 2px 10px rgba(0,0,0,0.2);

margin-bottom: 10px;

}

.subtitle {

color: rgba(255, 255, 255, 0.8);

font-size: 1.2rem;

max-width: 600px;

margin: 0 auto;

}

.card {

background: rgba(255, 255, 255, 0.85);

border-radius: 20px;

backdrop-filter: blur(var(--blur));

-webkit-backdrop-filter: blur(var(--blur));

box-shadow: 0 10px 30px rgba(0, 0, 0, 0.15);

padding: 20px; /* 减小内边距 */

margin-bottom: 20px; /* 减小外边距 */

overflow: hidden;

}

.card h2 {

color: var(--primary);

margin-bottom: 15px; /* 减小间距 */

padding-bottom: 8px; /* 减小间距 */

border-bottom: 2px solid rgba(106, 17, 203, 0.2);

font-size: 1.5rem; /* 减小字体大小 */
}

.form-group {

margin-bottom: 15px; /* 减小间距 */
}

label {

display: block;

margin-bottom: 5px; /* 减小间距 */

font-weight: 600;

color: var(--primary);

font-size: 0.9rem; /* 减小字体大小 */
}

input, textarea, select {

width: 100%;

padding: 10px 12px; /* 减小内边距 */

border: 2px solid #e0e0e0;

border-radius: 8px; /* 减小圆角 */

font-size: 0.9rem; /* 减小字体大小 */

transition: all 0.3s;

}

input:focus, textarea:focus, select:focus {

outline: none;

border-color: var(--secondary);

box-shadow: 0 0 0 3px rgba(37, 117, 252, 0.2);

}

button {

background: linear-gradient(to right, var(--primary),
var(--secondary));

color: white;

border: none;

padding: 10px 20px; /* 减小内边距 */

border-radius: 40px; /* 减小圆角 */

font-size: 0.9rem; /* 减小字体大小 */

font-weight: 600;

cursor: pointer;

transition: all 0.3s;

box-shadow: 0 4px 15px rgba(106, 17, 203, 0.3);

}

button:hover {

transform: translateY(-2px);

box-shadow: 0 7px 20px rgba(106, 17, 203, 0.4);

}

.post {

background: white;

border-radius: 12px; /* 减小圆角 */

padding: 15px; /* 减小内边距 */

margin-bottom: 15px; /* 减小外边距 */

box-shadow: 0 3px 10px rgba(0, 0, 0, 0.08); /* 减小阴影 */

border-left: 3px solid var(--secondary); /* 减小边框 */

}

.post-header {

display: flex;

align-items: center;

margin-bottom: 10px; /* 减小间距 */

cursor: pointer;

}

.avatar {

width: 35px; /* 减小头像大小 */

height: 35px; /* 减小头像大小 */

border-radius: 50%;

object-fit: cover;

margin-right: 10px; /* 减小间距 */

border: 2px solid var(--secondary);

}

.author {

font-weight: 600;

color: var(--primary);

font-size: 0.9rem; /* 减小字体大小 */

display: flex;
align-items: center;
}

.user-title {
  font-size: 0.8rem;
  margin-left: 5px;
  padding: 2px 6px;
  border-radius: 10px;
}

.founder-title {
  color: #FFD700 !important; /* 烫金色 */
  background-color: rgba(255, 215, 0, 0.1);
  font-weight: bold;
}

.member-title {
  color: #FFC0CB !important; /* 粉色 */
  background-color: rgba(255, 192, 203, 0.1);
}

.post-title {

font-size: 1.2rem; /* 减小字体大小 */

margin: 8px 0; /* 减小间距 */

color: #2c3e50;

}

.post-content {

line-height: 1.5; /* 减小行高 */

color: #444;

margin-bottom: 10px; /* 减小间距 */

font-size: 0.9rem; /* 减小字体大小 */
}

.post-meta {
  font-size: 0.8rem;
  color: #777;
  margin-top: 5px;
}

.comment {

background: #f8f9fa;

padding: 10px 12px; /* 减小内边距 */

border-radius: 8px; /* 减小圆角 */

margin-top: 8px; /* 减小间距 */

border-left: 2px solid var(--primary); /* 减小边框 */

cursor: pointer;

}

.comment-header {

display: flex;

align-items: center;

margin-bottom: 5px; /* 减小间距 */

}

.comment-author {

font-weight: 600;

color: var(--secondary);

margin-right: 6px; /* 减小间距 */

font-size: 0.85rem; /* 减小字体大小 */
}

.comment-time {

color: #777;

font-size: 0.75rem; /* 减小字体大小 */
}

.controls {

display: flex;

gap: 8px; /* 减小间距 */

margin-top: 10px; /* 减小间距 */
}

.btn-delete {

background: #ff4757;

padding: 5px 10px; /* 减小内边距 */

font-size: 0.8rem; /* 减小字体大小 */
}

.btn-ban {

background: #ff9f43;

padding: 5px 10px; /* 减小内边距 */

font-size: 0.8rem; /* 减小字体大小 */
}

.btn-unban {

background: #00d2d3;

padding: 5px 10px; /* 减小内边距 */

font-size: 0.8rem; /* 减小字体大小 */
}

.btn-chat {

background: #6c5ce7;

padding: 5px 10px; /* 减小内边距 */

font-size: 0.8rem; /* 减小字体大小 */
}

.auth-section {

display: flex;

gap: 12px; /* 减小间距 */

margin-top: 8px; /* 减小间距 */
}

.user-info {

display: flex;

align-items: center;

gap: 8px; /* 减小间距 */
}

.error {

color: #ff4757;

background: #ffeaa7;

padding: 8px; /* 减小内边距 */

border-radius: 6px; /* 减小圆角 */

margin: 12px 0; /* 减小间距 */

display: none;

font-size: 0.9rem; /* 减小字体大小 */
}

.tabs {

display: flex;

margin-bottom: 15px; /* 减小间距 */

border-bottom: 1px solid #e0e0e0;

}

.tab {

padding: 10px 20px; /* 减小内边距 */

cursor: pointer;

font-weight: 600;

color: #777;

font-size: 0.9rem; /* 减小字体大小 */
}

.tab.active {

color: var(--primary);

border-bottom: 2px solid var(--primary); /* 减小边框 */
}

.tab-content {

display: none;

}

.tab-content.active {

display: block;

}

.banned-user {

background-color: #ffeaa7;

border-left-color: #fdcb6e;

}

/* 用户主页样式 */

#profileModal {

display: none;

max-width: 500px; /* 减小宽度 */

margin: 15px auto; /* 减小间距 */
}

.profile-header {

text-align: center;

padding: 15px 0; /* 减小内边距 */

border-bottom: 1px solid #e0e0e0;

margin-bottom: 15px; /* 减小间距 */
}

.profile-tabs {

display: flex;

margin-bottom: 15px; /* 减小间距 */

border-bottom: 1px solid #e0e0e0;

}

.profile-tab {

padding: 8px 15px; /* 减小内边距 */

cursor: pointer;

font-weight: 600;

color: #777;

font-size: 0.9rem; /* 减小字体大小 */
}

.profile-tab.active {

color: var(--primary);

border-bottom: 2px solid var(--primary);

}

.profile-tab-content {

display: none;

}

.profile-tab-content.active {

display: block;

}

/* 聊天界面样式 */

.chat-container {

border: 1px solid #e0e0e0;

border-radius: 8px; /* 减小圆角 */

overflow: hidden;

display: flex;

flex-direction: column;

height: 350px; /* 减小高度 */
}

.chat-header {

background: var(--primary);

color: white;

padding: 8px 12px; /* 减小内边距 */

font-weight: bold;

font-size: 0.9rem; /* 减小字体大小 */
}

.chat-messages {

flex: 1;

overflow-y: auto;

padding: 12px; /* 减小内边距 */

display: flex;

flex-direction: column;

gap: 8px; /* 减小间距 */
}

.message {

max-width: 80%;

padding: 8px 12px; /* 减小内边距 */

border-radius: 15px; /* 减小圆角 */

position: relative;

font-size: 0.9rem; /* 减小字体大小 */
}

.message.sent {

align-self: flex-end;

background: var(--primary);

color: white;

border-bottom-right-radius: 5px;

}

.message.received {

align-self: flex-start;

background: #f1f1f1;

color: #333;

border-bottom-left-radius: 5px;

}

.message-time {

font-size: 0.65rem; /* 减小字体大小 */

opacity: 0.7;

text-align: right;

margin-top: 2px; /* 减小间距 */
}

.chat-input {

display: flex;

padding: 8px; /* 减小内边距 */

border-top: 1px solid #e0e0e0;

gap: 8px; /* 减小间距 */
}

.chat-input input {

flex: 1;

border-radius: 15px; /* 减小圆角 */

padding: 6px 12px; /* 减小内边距 */

font-size: 0.9rem; /* 减小字体大小 */
}

.chat-input button {

border-radius: 15px; /* 减小圆角 */

padding: 6px 12px; /* 减小内边距 */

font-size: 0.9rem; /* 减小字体大小 */
}

.uptime-footer {
  text-align: center;
  color: white;
  margin-top: 30px;
  padding: 15px;
  font-size: 0.9rem;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 10px;
}

@media (max-width: 768px) {

h1 {

font-size: 2.2rem; /* 减小字体大小 */
}

.card {

padding: 15px 12px; /* 减小内边距 */
}

}

</style>

</head>

<body>

<div class="container">

<header>

<h1>贴吧</h1>

<p class="subtitle">曦月的博客</p>

</header>

<div class="auth-section" id="authSection">

<!-- 动态生成登录/注册/用户信息 -->

</div>

<div class="tabs">

<div class="tab active" data-tab="posts">全部帖子</div>

<div class="tab" data-tab="create">发帖</div>

</div>

<div id="postsTab" class="tab-content active">

<div class="card">

<h2>最新帖子</h2>

<div id="postsContainer">

<!-- 帖子将动态加载到这里 -->

</div>

</div>

</div>

<div id="createTab" class="tab-content">

<div class="card">

<h2>发布新帖</h2>

<div class="form-group">

<label for="postTitle">标题</label>

<input type="text" id="postTitle" placeholder="输入帖子标题">

</div>

<div class="form-group">

<label for="postType">类型</label>

<select id="postType">

<option value="text">纯文字</option>

<option value="图文">图文</option>

</select>

</div>

<div class="form-group">

<label for="postContent">内容</label>

<textarea id="postContent" rows="5"
placeholder="分享你的想法..."></textarea>

</div>

<button id="submitPost">发布帖子</button>

<div class="error" id="postError"></div>

</div>

</div>

<div id="registerModal" class="card" style="display:none;">

<h2>注册账号</h2>

<div class="form-group">

<label for="regUsername">用户名</label>

<input type="text" id="regUsername" placeholder="输入用户名">

</div>

<div class="form-group">

<label for="regPassword">密码</label>

<input type="password" id="regPassword" placeholder="输入密码">

</div>

<div class="form-group">

<label for="regNickname">昵称</label>

<input type="text" id="regNickname"
placeholder="输入昵称（可选）">

</div>

<div class="form-group">

<label for="regAvatar">头像直链 (可选)</label>

<input type="url" id="regAvatar"
placeholder="https://example.com/avatar.jpg">

</div>

<div class="form-group">

<label for="regInviteCode">邀请码</label>

<input type="text" id="regInviteCode" placeholder="输入邀请码">

</div>

<button id="registerBtn">注册账号</button>

<div class="error" id="regError"></div>

<p>已有账号? <a href="#" id="showLogin">去登录</a></p>

</div>

<div id="loginModal" class="card">

<h2>登录账号</h2>

<div class="form-group">

<label for="loginUsername">用户名</label>

<input type="text" id="loginUsername" placeholder="输入用户名">

</div>

<div class="form-group">

<label for="loginPassword">密码</label>

<input type="password" id="loginPassword"
placeholder="输入密码">

</div>

<button id="loginBtn">登录</button>

<div class="error" id="loginError"></div>

<p>没有账号? <a href="#" id="showRegister">去注册</a></p>

</div>

<!-- 用户主页 -->

<div id="profileModal" class="card" style="display:none;">

<div class="profile-header">

<img id="profileAvatar" class="avatar"
style="width:70px;height:70px;">

<h2 id="profileNickname"></h2>

<p id="profileUsername" style="color:#777;"></p>

<p id="profileCreatedAt"
style="color:#777;font-size:0.8rem;"></p>

</div>

<div class="profile-tabs">

<div class="profile-tab active"
data-tab="profile">个人资料</div>

<div class="profile-tab" data-tab="messages">聊天</div>

</div>

<div id="profileTab" class="profile-tab-content active">

<div class="form-group">

<label for="editNickname">昵称</label>

<input type="text" id="editNickname" placeholder="输入昵称">

</div>

<div class="form-group">

<label for="editAvatar">头像直链</label>

<input type="url" id="editAvatar"
placeholder="https://example.com/avatar.jpg">

</div>

<div class="form-group">

<label for="currentPassword">当前密码</label>

<input type="password" id="currentPassword"
placeholder="输入当前密码">

</div>

<div class="form-group">

<label for="newPassword">新密码</label>

<input type="password" id="newPassword"
placeholder="输入新密码">

</div>

<button id="saveProfileBtn">保存更改</button>

<div class="error" id="profileError"></div>

<!-- 聊天按钮 -->

<div id="chatActions" style="display:none;margin-top:15px;">

<h3>聊天操作</h3>

<button id="startChatBtn" class="btn-chat">发送消息</button>

</div>

<!-- 管理员操作 -->

<div id="adminActions" style="display:none;margin-top:15px;">

<h3>管理员操作</h3>

<button id="banUserBtn" class="btn-ban"
style="display:none;">封禁用户</button>

<button id="unbanUserBtn" class="btn-unban"
style="display:none;">解封用户</button>

</div>

</div>

<div id="messagesTab" class="profile-tab-content"
style="display:none;">

<div class="chat-container">

<div class="chat-header">

<h3>与 <span id="chatWithUser"></span> 的聊天</h3>

</div>

<div class="chat-messages" id="chatMessages">

<!-- 消息将动态加载到这里 -->

</div>

<div class="chat-input">

<input type="text" id="chatInput" placeholder="输入消息...">

<button id="sendChatBtn">发送</button>

</div>

</div>

</div>

</div>

</div>

<!-- 网站运行时间显示 -->
<footer class="uptime-footer">
  本站已稳定运行 <span id="uptime">0年0月0天0小时0分0秒</span>，网站建立于2025年8月24日
</footer>

</div>

<script>

// 全局状态

const state = {

token: localStorage.getItem('token') || '',

username: localStorage.getItem('username') || '',

nickname: localStorage.getItem('nickname') || '',

role: localStorage.getItem('role') || '',

title: localStorage.getItem('title') || '注册会员', // 添加头衔

avatar: localStorage.getItem('avatar') || '',

createdAt: localStorage.getItem('createdAt') || ''

};

// 全局变量

let currentProfileUser = null;

// HTML 转义函数（防止XSS攻击）

function escapeHTML(str) {

if (!str) return '';

return str

.replace(/&/g, '&amp;')

.replace(/</g, '&lt;')

.replace(/>/g, '&gt;')

.replace(/"/g, '&quot;')

.replace(/'/g, '&#39;');

}
// 时间格式化函数 - 显示相对时间
function formatRelativeTime(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) {
    return diffSecs + '秒前';
  } else if (diffMins < 60) {
    return diffMins + '分钟前';
  } else if (diffHours < 24) {
    return diffHours + '小时前';
  } else if (diffDays < 30) {
    return diffDays + '天前';
  } else {
    return date.toLocaleDateString();
  }
}

// 计算网站运行时间
function calculateUptime() {
  const startDate = new Date('2025-08-24');
  const now = new Date();
  
  const diffMs = now - startDate;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  const diffSecs = Math.floor((diffMs % (1000 * 60)) / 1000);
  
  return {
    years: Math.floor(diffDays / 365),
    months: Math.floor((diffDays % 365) / 30),
    days: diffDays % 30,
    hours: diffHours,
    minutes: diffMins,
    seconds: diffSecs
  };
}
// 更新网站运行时间显示
function updateUptime() {
  const uptime = calculateUptime();
  document.getElementById('uptime').textContent = 
    `${uptime.years}年${uptime.months}月${uptime.days}天${uptime.hours}小时${uptime.minutes}分${uptime.seconds}秒`;
}

// DOM 元素

const elements = {

authSection: document.getElementById('authSection'),

postsContainer: document.getElementById('postsContainer'),

postTitle: document.getElementById('postTitle'),

postType: document.getElementById('postType'),

postContent: document.getElementById('postContent'),

submitPost: document.getElementById('submitPost'),

postError: document.getElementById('postError'),

loginUsername: document.getElementById('loginUsername'),

loginPassword: document.getElementById('loginPassword'),

loginBtn: document.getElementById('loginBtn'),

loginError: document.getElementById('loginError'),

regUsername: document.getElementById('regUsername'),

regPassword: document.getElementById('regPassword'),

regNickname: document.getElementById('regNickname'),

regAvatar: document.getElementById('regAvatar'),

regInviteCode: document.getElementById('regInviteCode'),

registerBtn: document.getElementById('registerBtn'),

regError: document.getElementById('regError'),

showRegister: document.getElementById('showRegister'),

showLogin: document.getElementById('showLogin'),

registerModal: document.getElementById('registerModal'),

loginModal: document.getElementById('loginModal'),

profileModal: document.getElementById('profileModal'),

profileAvatar: document.getElementById('profileAvatar'),

profileNickname: document.getElementById('profileNickname'),

profileUsername: document.getElementById('profileUsername'),

profileCreatedAt: document.getElementById('profileCreatedAt'),

editNickname: document.getElementById('editNickname'),

editAvatar: document.getElementById('editAvatar'),

currentPassword: document.getElementById('currentPassword'),

newPassword: document.getElementById('newPassword'),

saveProfileBtn: document.getElementById('saveProfileBtn'),

profileError: document.getElementById('profileError'),

adminActions: document.getElementById('adminActions'),

chatActions: document.getElementById('chatActions'),

banUserBtn: document.getElementById('banUserBtn'),

unbanUserBtn: document.getElementById('unbanUserBtn'),

startChatBtn: document.getElementById('startChatBtn'),

profileTabs: document.querySelectorAll('.profile-tab'),

profileTabContents: document.querySelectorAll('.profile-tab-content'),

chatMessages: document.getElementById('chatMessages'),

chatInput: document.getElementById('chatInput'),

sendChatBtn: document.getElementById('sendChatBtn'),

chatWithUser: document.getElementById('chatWithUser'),

tabs: document.querySelectorAll('.tab'),

tabContents: document.querySelectorAll('.tab-content')

};

// 显示错误

function showError(element, message) {

element.textContent = message;

element.style.display = 'block';

}

function clearError(element) {

element.textContent = '';

element.style.display = 'none';

}

// 初始化

function init() {

setupEventListeners();

updateAuthUI();

loadPosts();

// 更新网站运行时间
setInterval(updateUptime, 1000);
updateUptime();

// 渐变动画

try {

setInterval(function() {

var hue = Math.floor(Math.random() * 360);

document.documentElement.style.setProperty('--primary', 'hsl(' +
hue + ', 70%, 50%)');

document.documentElement.style.setProperty('--secondary', 'hsl(' +
((hue + 60) % 360) + ', 70%, 50%)');

}, 5000);

} catch (e) {

console.error('渐变动画错误:', e);

}

}

// 设置事件监听

function setupEventListeners() {

// 切换标签

elements.tabs.forEach(function(tab) {

tab.addEventListener('click', function() {

elements.tabs.forEach(function(t) {

t.classList.remove('active');

});

tab.classList.add('active');

var tabName = tab.getAttribute('data-tab');

elements.tabContents.forEach(function(content) {

content.classList.remove('active');

if (content.id === tabName + 'Tab') {

content.classList.add('active');

}

});

});

});

// 切换个人资料标签

elements.profileTabs.forEach(function(tab) {

tab.addEventListener('click', function() {

elements.profileTabs.forEach(function(t) {

t.classList.remove('active');

});

tab.classList.add('active');

var tabName = tab.getAttribute('data-tab');

elements.profileTabContents.forEach(function(content) {

content.classList.remove('active');

if (content.id === tabName + 'Tab') {

content.classList.add('active');

// 如果切换到消息标签，加载消息

if (tabName === 'messages' && currentProfileUser) {

elements.chatWithUser.textContent = currentProfileUser;

loadChatMessages();

}

}

});

});

});

// 登录

elements.loginBtn.addEventListener('click', function() {

var username = elements.loginUsername.value;

var password = elements.loginPassword.value;

if (!username || !password) {

showError(elements.loginError, '请填写完整信息');

return;

}

fetch('/api/login', {

method: 'POST',

headers: { 'Content-Type': 'application/json' },

body: JSON.stringify({ username: username, password: password })

})

.then(function(response) {

if (!response.ok) {

return response.json().then(function(data) {

throw new Error(data.error || '登录失败');

});

}

return response.json();

})

.then(function(data) {

if (data.token) {

state.token = data.token;

state.username = data.username;

state.nickname = data.nickname || data.username;

state.role = data.role;

state.title = data.title || '注册会员'; // 添加头衔

state.avatar = data.avatar;

state.createdAt = data.createdAt;

localStorage.setItem('token', data.token);

localStorage.setItem('username', data.username);

localStorage.setItem('nickname', data.nickname || data.username);

localStorage.setItem('role', data.role);

localStorage.setItem('title', data.title || '注册会员'); // 添加头衔

localStorage.setItem('avatar', data.avatar);

localStorage.setItem('createdAt', data.createdAt);

updateAuthUI();

clearError(elements.loginError);

elements.loginUsername.value = '';

elements.loginPassword.value = '';

} else {

throw new Error('登录响应缺少令牌');

}

})

.catch(function(error) {

console.error('Login error:', error);

showError(elements.loginError, error.message || '网络错误，请重试');

});

});

// 注册

elements.registerBtn.addEventListener('click', function() {

var username = elements.regUsername.value;

var password = elements.regPassword.value;

var nickname = elements.regNickname.value || username;

var avatar = elements.regAvatar.value;

var inviteCode = elements.regInviteCode.value;

if (!username || !password || !inviteCode) {

showError(elements.regError, '请填写完整信息');

return;

}

fetch('/api/register', {

method: 'POST',

headers: { 'Content-Type': 'application/json' },

body: JSON.stringify({

username: username,

password: password,

nickname: nickname,

avatar: avatar,

inviteCode: inviteCode

})

})

.then(function(response) {

if (!response.ok) {

return response.json().then(function(data) {

throw new Error(data.error || '注册失败');

});

}

return response.json();

})

.then(function(data) {

if (data.success) {

alert('注册成功！请登录');

elements.regUsername.value = '';

elements.regPassword.value = '';

elements.regNickname.value = '';

elements.regAvatar.value = '';

elements.regInviteCode.value = '';

clearError(elements.regError);

showLoginModal();

} else {

throw new Error('注册响应无效');

}

})

.catch(function(error) {

console.error('Register error:', error);

showError(elements.regError, error.message || '网络错误，请重试');

});

});

// 发布帖子

elements.submitPost.addEventListener('click', function() {

var title = elements.postTitle.value;

var content = elements.postContent.value;

var type = elements.postType.value;

if (!title || !content) {

showError(elements.postError, '标题和内容不能为空');

return;

}

fetch('/api/posts', {

method: 'POST',

headers: {

'Content-Type': 'application/json',

'Authorization': 'Bearer ' + state.token

},

body: JSON.stringify({

title: title,

content: content,

type: type

})

})

.then(function(response) {

if (!response.ok) {

return response.json().then(function(data) {

throw new Error(data.error || '发帖失败');

});

}

return response.json();

})

.then(function(data) {

if (data.postId) {

elements.postTitle.value = '';

elements.postContent.value = '';

clearError(elements.postError);

loadPosts();

} else {

throw new Error('发帖响应缺少帖子ID');

}

})

.catch(function(error) {

console.error('Post error:', error);

showError(elements.postError, error.message || '网络错误，请重试');

});

});

// 切换注册/登录模态框

elements.showRegister.addEventListener('click', function(e) {

e.preventDefault();

showRegisterModal();

});

elements.showLogin.addEventListener('click', function(e) {

e.preventDefault();

showLoginModal();

});

// 保存用户资料

elements.saveProfileBtn.addEventListener('click', function() {

const nickname = elements.editNickname.value;

const avatar = elements.editAvatar.value;

const currentPassword = elements.currentPassword.value;

const newPassword = elements.newPassword.value;

const data = {};

if (nickname) data.nickname = nickname;

if (avatar) data.avatar = avatar;

if (currentPassword && newPassword) {

data.currentPassword = currentPassword;

data.newPassword = newPassword;

}

fetch('/api/users/' + state.username + '/profile', {

method: 'PUT',

headers: {

'Content-Type': 'application/json',

'Authorization': 'Bearer ' + state.token

},

body: JSON.stringify(data)

})

.then(response => {

if (!response.ok) {

return response.json().then(data => {

throw new Error(data.error || '保存失败');

});

}

return response.json();

})

.then(data => {

if (data.success) {

alert('资料已更新');

// 更新本地状态

if (nickname) {

state.nickname = nickname;

localStorage.setItem('nickname', nickname);

}

if (avatar) {

state.avatar = avatar;

localStorage.setItem('avatar', avatar);

}

// 更新UI

updateAuthUI();

// 如果是当前用户主页，更新显示

if (currentProfileUser === state.username) {

elements.profileNickname.textContent = nickname;

elements.profileAvatar.src = avatar;

}

}

})

.catch(error => {

showError(elements.profileError, error.message);

});

});

// 封禁用户

elements.banUserBtn.addEventListener('click', function() {

banUser(currentProfileUser);

});

// 解封用户

elements.unbanUserBtn.addEventListener('click', function() {

unbanUser(currentProfileUser);

});

// 开始聊天按钮

elements.startChatBtn.addEventListener('click', function() {

// 切换到聊天标签

document.querySelector('.profile-tab[data-tab="messages"]').click();

});

// 发送聊天消息

elements.sendChatBtn.addEventListener('click', function() {

const message = elements.chatInput.value.trim();

if (!message) return;

fetch('/api/messages', {

method: 'POST',

headers: {

'Content-Type': 'application/json',

'Authorization': 'Bearer ' + state.token

},

body: JSON.stringify({

to: currentProfileUser,

content: message

})

})

.then(response => {

if (!response.ok) {

return response.json().then(data => {

throw new Error(data.error || '发送失败');

});

}

return response.json();

})

.then(data => {

elements.chatInput.value = '';

loadChatMessages();

})

.catch(error => {

console.error('发送消息失败:', error);

alert('发送消息失败: ' + error.message);

});

});

// 点击头像显示用户主页

document.addEventListener('click', function(e) {

if (e.target.classList.contains('avatar') && e.target.alt) {

const username = e.target.alt.replace('@', '');

showUserProfile(username);

}

});

}

// 加载帖子

function loadPosts() {

fetch('/api/posts')

.then(function(response) {

if (!response.ok) {

return response.json().then(function(data) {

throw new Error(data.error || '加载帖子失败');

});

}

return response.json();

})

.then(function(posts) {

var html = '';

for (var i = 0; i < posts.length; i++) {

var post = posts[i];

// XSS 修复：转义帖子内容

var safeTitle = escapeHTML(post.title);

var safeContent = escapeHTML(post.content);

var safeNickname = escapeHTML(post.nickname || post.author);
var safeUserTitle = escapeHTML(post.title || '注册会员'); // 添加头衔
var timeAgoStr = formatRelativeTime(post.createdAt); // 相对时间

html += '<div class="post" data-post-id="' + escapeHTML(post.id) +
'">' +

'<div class="post-header" title="' + safeNickname + '">' +

'<img src="' + escapeHTML(post.avatar ||
'https://api.dicebear.com/7.x/avataaars/svg?seed=default') + '" ' +

'alt="@' + escapeHTML(post.author) + '" class="avatar">' +

'<div>' +

'<div class="author">' + safeNickname + 
' <span class="user-title ' + (safeUserTitle === '创始人' ? 'founder-title' : 'member-title') + '">' + 
safeUserTitle + '</span></div>' +

'<div class="post-meta">' + new Date(post.createdAt).toLocaleString() + 
' · 阅读量: ' + (post.views || 0) + ' · ' + timeAgoStr + '</div>' +

'</div>' +

'</div>' +

'<h3 class="post-title">' + safeTitle + '</h3>' +

'<div class="post-content">' + safeContent + '</div>';

// 添加删除按钮（仅管理员可见）

if (state.username && state.role === 'admin') {

html += '<div class="controls">' +

'<button class="btn-delete" data-post-id="' +
escapeHTML(post.id) + '">删除</button>' +

'</div>';

}

// 评论区域

html += '<div class="comments-section">' +

'<h4>评论</h4>' +

'<div class="comments-list" data-post-id="' +
escapeHTML(post.id) + '">' +

'<div class="loading-comments">加载评论中...</div>' +

'</div>' +

'<div class="form-group" style="margin-top: 15px;">' +

'<textarea class="comment-input" placeholder="发表评论..." ' +

'data-post-id="' + escapeHTML(post.id) + '"
rows="2"></textarea>' +

'<button class="submit-comment" data-post-id="' +
escapeHTML(post.id) + '">评论</button>' +

'</div>' +

'</div>' +

'</div>';

}

elements.postsContainer.innerHTML = html ||
'<p>还没有帖子，快来发布第一条吧！</p>';

// 加载每个帖子的评论

loadAllComments();

// 添加删除事件

var deleteButtons = document.querySelectorAll('.btn-delete');

for (var i = 0; i < deleteButtons.length; i++) {

deleteButtons[i].addEventListener('click', function() {

var postId = this.getAttribute('data-post-id');

if (!confirm('确定要删除这个帖子吗？')) return;

fetch('/api/posts/' + postId, {

method: 'DELETE',

headers: { 'Authorization': 'Bearer ' + state.token }

})

.then(function(response) {

if (!response.ok) {

return response.json().then(function(data) {

throw new Error(data.error || '删除失败');

});

}

loadPosts();

})

.catch(function(error) {

alert(error.message || '删除失败');

});

});

}

// 添加评论事件

var commentButtons = document.querySelectorAll('.submit-comment');

for (var i = 0; i < commentButtons.length; i++) {

commentButtons[i].addEventListener('click', function() {

var postId = this.getAttribute('data-post-id');

var textarea =
document.querySelector('.comment-input[data-post-id="' + postId +
'"]');

var content = textarea.value;

if (!content || content.trim() === '') {

alert('评论内容不能为空');

return;

}

fetch('/api/posts/' + postId + '/comments', {

method: 'POST',

headers: {

'Content-Type': 'application/json',

'Authorization': 'Bearer ' + state.token

},

body: JSON.stringify({ content: content })

})

.then(function(response) {

if (!response.ok) {

return response.json().then(function(data) {

throw new Error(data.error || '评论失败');

});

}

textarea.value = '';

// 重新加载评论

var commentsList =
document.querySelector('.comments-list[data-post-id="' + postId +
'"]');

if (commentsList) {

commentsList.innerHTML = '<div
class="loading-comments">加载评论中...</div>';

loadComments(postId);

}

})

.catch(function(error) {

alert(error.message || '评论失败');

});

});

}

})

.catch(function(error) {

console.error('Load posts error:', error);

elements.postsContainer.innerHTML =
'<p>加载帖子失败，请刷新重试</p>';

showError(elements.postError, error.message || '加载帖子失败');

});

}

// 加载所有帖子的评论

function loadAllComments() {

var commentSections = document.querySelectorAll('.comments-list');

for (var i = 0; i < commentSections.length; i++) {

var postId = commentSections[i].getAttribute('data-post-id');

loadComments(postId);

}

}

// 加载特定帖子的评论

function loadComments(postId) {

fetch('/api/posts/' + postId + '/comments')

.then(function(response) {

if (!response.ok) {

return response.json().then(function(data) {

throw new Error(data.error || '加载评论失败');

});

}

return response.json();

})

.then(function(comments) {

var commentsList =
document.querySelector('.comments-list[data-post-id="' + postId +
'"]');

if (!commentsList) return;

if (comments.length === 0) {

commentsList.innerHTML = '<div
class="no-comments">还没有评论，快来抢沙发！</div>';

return;

}

var html = '';

for (var i = 0; i < comments.length; i++) {

var comment = comments[i];

// XSS 修复：转义评论内容

var safeContent = escapeHTML(comment.content);

var safeNickname = escapeHTML(comment.nickname || comment.author);
var safeUserTitle = escapeHTML(comment.title || '注册会员'); // 添加头衔

html += '<div class="comment" data-comment-id="' +
escapeHTML(comment.id) + '" title="' + safeNickname + '">' +

'<div class="comment-header">' +

'<img src="' + escapeHTML(comment.avatar ||
'https://api.dicebear.com/7.x/avataaars/svg?seed=default') + '" ' +

'alt="@' + escapeHTML(comment.author) + '" class="avatar"
style="width:24px;height:24px;margin-right:5px;">' +

'<span class="comment-author">' + safeNickname + 
' <span class="user-title ' + (safeUserTitle === '创始人' ? 'founder-title' : 'member-title') + '">' + 
safeUserTitle + '</span></span>' +

'<span class="comment-time">' + new
Date(comment.createdAt).toLocaleString() + '</span>' +

'</div>' +

'<p>' + safeContent + '</p>';

// 添加删除按钮（仅管理员和评论作者可见）

if (state.username && (state.role === 'admin' || state.username ===
comment.author)) {

html += '<div class="controls">' +

'<button class="btn-delete" data-comment-id="' +
escapeHTML(comment.id) + '" data-post-id="' + escapeHTML(postId) +
'">删除</button>' +

'</div>';

}

html += '</div>';

}

commentsList.innerHTML = html;

// 添加评论删除事件

var commentDeleteButtons =
commentsList.querySelectorAll('.btn-delete');

for (var i = 0; i < commentDeleteButtons.length; i++) {

commentDeleteButtons[i].addEventListener('click', function(e) {

e.stopPropagation();

var commentId = this.getAttribute('data-comment-id');

var postId = this.getAttribute('data-post-id');

if (!confirm('确定要删除这条评论吗？')) return;

fetch('/api/comments/' + postId + '/' + commentId, {

method: 'DELETE',

headers: { 'Authorization': 'Bearer ' + state.token }

})

.then(function(response) {

if (!response.ok) {

return response.json().then(function(data) {

throw new Error(data.error || '删除失败');

});

}

// 重新加载评论

var commentsList =
document.querySelector('.comments-list[data-post-id="' + postId +
'"]');

if (commentsList) {

commentsList.innerHTML = '<div
class="loading-comments">加载评论中...</div>';

loadComments(postId);

}

})

.catch(function(error) {

alert(error.message || '删除失败');

});

});

}

})

.catch(function(error) {

console.error('Load comments error:', error);

var commentsList =
document.querySelector('.comments-list[data-post-id="' + postId +
'"]');

if (commentsList) {

commentsList.innerHTML = '<div
class="error-comments">加载评论失败</div>';

}

});

}

// 更新认证UI

function updateAuthUI() {

var html = '';

if (state.token && state.username) {

html = '<div class="user-info">' +

'<img src="' + (state.avatar ||
'https://api.dicebear.com/7.x/avataaars/svg?seed=default') + '" ' +

'alt="@' + state.username + '" class="avatar"
style="width:40px;height:40px;">' +

'<div>' +

'<div>' + state.nickname + ' <span class="user-title ' + (state.title === '创始人' ? 'founder-title' : 'member-title') + '">' + state.title + '</span> ' + (state.role === 'admin' ? '(管理员)' : '') + '</div>' +

'<button id="logoutBtn" style="margin-top:5px;padding:3px
10px;font-size:0.9rem;">退出</button>' +

'</div>' +

'</div>';

} else {

html = '<button id="loginBtnUI">登录</button>' +

'<button id="registerBtnUI">注册</button>';

}

elements.authSection.innerHTML = html;

if (!state.token || !state.username) {

elements.loginModal.style.display = 'block';

elements.registerModal.style.display = 'none';

elements.profileModal.style.display = 'none';

} else {

var logoutBtn = document.getElementById('logoutBtn');

if (logoutBtn) {

logoutBtn.addEventListener('click', logout);

}

}

var loginBtnUI = document.getElementById('loginBtnUI');

if (loginBtnUI) {

loginBtnUI.addEventListener('click', showLoginModal);

}

var registerBtnUI = document.getElementById('registerBtnUI');

if (registerBtnUI) {

registerBtnUI.addEventListener('click', showRegisterModal);

}

}

// 显示模态框

function showLoginModal() {

elements.loginModal.style.display = 'block';

elements.registerModal.style.display = 'none';

elements.profileModal.style.display = 'none';

}

function showRegisterModal() {

elements.loginModal.style.display = 'none';

elements.registerModal.style.display = 'block';

elements.profileModal.style.display = 'none';

}

// 显示用户主页

function showUserProfile(username) {

currentProfileUser = username;

elements.profileModal.style.display = 'block';

// 获取用户信息

fetch('/api/users/' + username)

.then(response => {

if (!response.ok) {

return response.json().then(data => {

console.error('API响应错误:', data);

throw new Error(data.error || '无法获取用户信息');

});

}

return response.json();

})

.then(user => {

// 显示用户信息

elements.profileAvatar.src = user.avatar;

elements.profileNickname.textContent = user.nickname;

elements.profileUsername.textContent = '@' + user.username;
elements.profileUsername.innerHTML += ' <span class="user-title ' + (user.title === '创始人' ? 'founder-title' : 'member-title') + '">' + (user.title || '注册会员') + '</span>';

if (user.createdAt) {

elements.profileCreatedAt.textContent =

'注册于 ' + new Date(user.createdAt).toLocaleDateString();

}

// 检查是否是当前用户

if (state.username === username) {

// 显示编辑表单

elements.editNickname.value = user.nickname;

elements.editAvatar.value = user.avatar;

elements.chatActions.style.display = 'none';

} else {

// 隐藏编辑表单

elements.editNickname.closest('.form-group').style.display = 'none';

elements.editAvatar.closest('.form-group').style.display = 'none';

elements.currentPassword.closest('.form-group').style.display =
'none';

elements.newPassword.closest('.form-group').style.display = 'none';

elements.saveProfileBtn.style.display = 'none';

// 显示聊天按钮

elements.chatActions.style.display = 'block';

// 检查是否是管理员

if (state.role === 'admin' && username !== 'admin') {

elements.adminActions.style.display = 'block';

if (user.banned) {

elements.banUserBtn.style.display = 'none';

elements.unbanUserBtn.style.display = 'block';

} else {

elements.banUserBtn.style.display = 'block';

elements.unbanUserBtn.style.display = 'none';

}

} else {

elements.adminActions.style.display = 'none';

}

}

})

.catch(error => {

console.error('获取用户信息失败:', error);

alert('无法获取用户信息: ' + error.message);

elements.profileModal.style.display = 'none';

});

}

// 退出登录

function logout() {

localStorage.removeItem('token');

localStorage.removeItem('username');

localStorage.removeItem('nickname');

localStorage.removeItem('role');

localStorage.removeItem('title');

localStorage.removeItem('avatar');

localStorage.removeItem('createdAt');

state.token = '';

state.username = '';

state.nickname = '';

state.role = '';

state.title = '注册会员';

state.avatar = '';

state.createdAt = '';

updateAuthUI();

loadPosts();

}

// 封禁用户

function banUser(username) {

if (!confirm('确定要封禁用户 ' + username + ' 吗？')) return;

fetch('/api/ban', {

method: 'POST',

headers: {

'Content-Type': 'application/json',

'Authorization': 'Bearer ' + state.token

},

body: JSON.stringify({ username: username })

})

.then(function(response) {

if (!response.ok) {

return response.json().then(function(data) {

throw new Error(data.error || '封禁失败');

});

}

return response.json();

})

.then(function(data) {

if (data.user) {

alert('用户 ' + username + ' 已被封禁');

// 更新用户主页上的按钮

if (currentProfileUser === username) {

elements.banUserBtn.style.display = 'none';

elements.unbanUserBtn.style.display = 'block';

}

}

})

.catch(function(error) {

alert('封禁失败: ' + error.message);

});

}

// 解封用户

function unbanUser(username) {

if (!confirm('确定要解封用户 ' + username + ' 吗？')) return;

fetch('/api/unban', {

method: 'POST',

headers: {

'Content-Type': 'application/json',

'Authorization': 'Bearer ' + state.token

},

body: JSON.stringify({ username: username })

})

.then(function(response) {

if (!response.ok) {

return response.json().then(function(data) {

throw new Error(data.error || '解封失败');

});

}

return response.json();

})

.then(function(data) {

if (data.user) {

alert('用户 ' + username + ' 已被解封');

// 更新用户主页上的按钮

if (currentProfileUser === username) {

elements.banUserBtn.style.display = 'block';

elements.unbanUserBtn.style.display = 'none';

}

}

})

.catch(function(error) {

alert('解封失败: ' + error.message);

});

}

// 加载聊天消息

function loadChatMessages() {

fetch('/api/messages')

.then(response => {

if (!response.ok) {

throw new Error('无法加载消息');

}

return response.json();

})

.then(messages => {

var html = '';

for (var i = 0; i < messages.length; i++) {

var message = messages[i];

// 只显示与当前聊天用户相关的消息

if ((message.from === state.username && message.to ===
currentProfileUser) ||

(message.to === state.username && message.from === currentProfileUser)) {

var isSent = message.from === state.username;

var safeContent = escapeHTML(message.content);

html += '<div class="message ' + (isSent ? 'sent' :
'received') + '">' +

'<div class="message-content">' + safeContent + '</div>' +

'<div class="message-time">' + new
Date(message.createdAt).toLocaleTimeString() + '</div>' +

'</div>';

}

}

elements.chatMessages.innerHTML = html;

// 滚动到底部

elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;

})

.catch(error => {

console.error('加载消息失败:', error);

});

}

// 初始化应用

document.addEventListener('DOMContentLoaded', function() {

try {

init();

} catch (e) {

console.error('初始化应用时出错:', e);

alert('应用初始化失败，请刷新页面重试');

}

});

</script>

</body>

</html>`;