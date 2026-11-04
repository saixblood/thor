'use strict';
// Standalone panel. The bot can provide a runtime adapter to PanelService.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const ROOT = path.join(__dirname, 'public');
const BOT = path.join(__dirname, '..', 'bot');
const store = path.join(__dirname, '.settings.json');
const read = (file, fallback) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; } };
const send = (res, code, value) => { res.writeHead(code, {'Content-Type':'application/json', 'Cache-Control':'no-store'}); res.end(JSON.stringify(value)); };
class PanelService {
  constructor(adapter = {}) { this.adapter = adapter; this.sessions = new Map(); this.attempts = new Map(); }
  start(port = process.env.PORT || process.env.PANEL_PORT || 3000) {
    if (this.server) return;
    this.server = http.createServer((req,res) => this.handle(req,res).catch(() => send(res,500,{error:{code:'INTERNAL_ERROR',message:'Request could not be completed.'}})));
    this.server.listen(port, '0.0.0.0');
  }
  stop() { if (this.server) this.server.close(); this.server = null; this.sessions.clear(); }
  async handle(req,res) {
    const url = new URL(req.url, 'http://localhost');
    const token = process.env.PANEL_TOKEN;
    const cookie = (req.headers.cookie || '').split('; ').find(v => v.startsWith('hades_session='))?.slice(14);
    const authenticated = token && cookie && this.sessions.has(cookie) && this.sessions.get(cookie) > Date.now();
    if (url.pathname === '/api/auth' && req.method === 'POST') {
      const ip = req.socket.remoteAddress; const now = Date.now(); const tries = (this.attempts.get(ip) || []).filter(t => now-t < 60000);
      if (tries.length >= 5) return send(res,429,{error:{code:'RATE_LIMITED',message:'Too many attempts. Try again in a minute.'}});
      tries.push(now); this.attempts.set(ip,tries);
      const body = await this.body(req); const given = Buffer.from(String(body.token || '')); const expected = Buffer.from(token || '');
      if (!token || given.length !== expected.length || !crypto.timingSafeEqual(given,expected)) return send(res,401,{error:{code:'UNAUTHORIZED',message:'Invalid panel token or PANEL_TOKEN is not configured.'}});
      const id = crypto.randomBytes(32).toString('hex'); this.sessions.set(id,now+12*3600000);
      res.setHeader('Set-Cookie',`hades_session=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${req.socket.encrypted ? '; Secure' : ''}`); return send(res,200,{ok:true});
    }
    if (url.pathname.startsWith('/api/')) {
      // With no token configured, expose only non-sensitive offline status for initial setup.
      if (!authenticated && (token || url.pathname !== '/api/status')) return send(res,401,{error:{code:'UNAUTHORIZED',message:'Panel authentication required.'}});
      if (url.pathname === '/api/status') {
        const runtime = this.adapter.status?.() || {};
        return send(res,200,{online:!!runtime.online, uptime:runtime.uptime || 0, sessionUptime:runtime.sessionUptime || 0, memory:runtime.memory || null, groups:runtime.groups ?? null, messagesIn:runtime.messagesIn ?? null, messagesOut:runtime.messagesOut ?? null, commandsRun:runtime.commandsRun ?? null, ping:runtime.ping ?? null, cpu:runtime.cpu ?? null, version:read(path.join(BOT,'config.json'),{}).bot?.version || '1.0.0', configured:!!token});
      }
      if (url.pathname === '/api/settings' && req.method === 'GET') return send(res,200,read(store,{theme:'system'}));
      if (url.pathname === '/api/settings' && req.method === 'POST') { const b=await this.body(req); const old=read(store,{}); const next={...old,theme:['system','dark','light'].includes(b.theme)?b.theme:old.theme}; fs.writeFileSync(store,JSON.stringify(next,null,2)); return send(res,200,next); }
      if (url.pathname === '/api/config' && req.method === 'GET') { const c=read(path.join(BOT,'config.json'),{}); return send(res,200,{bot:c.bot,ranks:c.ranks,behavior:c.behavior}); }
      if (url.pathname === '/api/commands') { const files=fs.readdirSync(path.join(BOT,'src/commands')).filter(f=>f.endsWith('.js')&&f!=='index.js'); return send(res,200,files.map(f=>({name:f.slice(0,-3)}))); }
      if (url.pathname === '/api/session') { const state=read(path.join(BOT,'session/appstate.json'),[]); const cookies=Array.isArray(state)?state.map(c=>({name:c.key || c.name, expires:c.expires || c.expirationDate || null})).filter(c=>c.name):[]; return send(res,200,{cookies,valid:false}); }
      return send(res,404,{error:{code:'NOT_FOUND',message:'Endpoint not found.'}});
    }
    let file = url.pathname === '/' ? '/index.html' : url.pathname;
    const resolved=path.resolve(ROOT,'.'+file); if (!resolved.startsWith(ROOT+path.sep)) return send(res,403,{error:{code:'FORBIDDEN'}});
    fs.readFile(resolved,(err,data)=>{ if(err){res.writeHead(404);return res.end('Not found');} const ext=path.extname(resolved); res.writeHead(200,{'Content-Type':({'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.json':'application/json','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'})[ext] || 'application/octet-stream','X-Content-Type-Options':'nosniff'}); res.end(data); });
  }
  body(req) { return new Promise((resolve,reject)=>{let s='';req.on('data',c=>{s+=c;if(s.length>65536){reject(Error('too large'));req.destroy();}});req.on('end',()=>{try{resolve(JSON.parse(s || '{}'));}catch{reject(Error('invalid json'));}});req.on('error',reject);}); }
}
module.exports = PanelService;
if (require.main === module) { new PanelService().start(); console.log(`Hades panel listening on ${process.env.PORT || process.env.PANEL_PORT || 3000}`); }
