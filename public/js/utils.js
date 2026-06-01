// Shared utilities
export const WS_PORT = 3000
export function $(id) { return document.getElementById(id) }
export function uid() { return `${Date.now()}_${Math.random().toString(36).slice(2,8)}` }
export function genRoom() { const c='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let s='';for(let i=0;i<6;i++)s+=c[Math.floor(Math.random()*c.length)];return s }
export function escHtml(s) { const d=document.createElement('div');d.textContent=s;return d.innerHTML }

// Multi-page system
export const PAGE_SIZES = { A4:{w:595,h:842}, A5:{w:420,h:595}, Letter:{w:612,h:792}, Square:{w:600,h:600}, Auto:null }
export let pages = [{ id:'page_1', name:'Page 1', size:'A4', strokes:new Map() }]
export let currentPage = 0
export function getPageId() { return pages[currentPage]?.id || 'page_1' }
export function getStrokes() { return pages[currentPage]?.strokes || (pages[0]?.strokes || new Map()) }
export function getPageSize() { const s=pages[currentPage]?.size||'A4'; return PAGE_SIZES[s] || { w:595, h:842 } }

// Shared state
export let USER_ID = `u_${Date.now().toString(36)}`
export let userName = ''
export function setNick(name) { userName = name; USER_ID = `u_${name}_${Date.now().toString(36)}`; const b=$('user-badge'); if(b)b.textContent=name }
export let room = '', ws = null, connectedHost = ''
export function setRoom(r) { room = r }
export function setWS(w) { ws = w }
export function setConnectedHost(h) { connectedHost = h }

// Canvas refs
export const cv = {
  mine: { bg:$('cv-mine-bg'), fg:$('cv-mine-fg'), ctxBg:null, ctxFg:null },
  peer: { bg:$('cv-peer-bg'), fg:$('cv-peer-fg'), ctxBg:null, ctxFg:null },
}
export const strokes = { peer: new Map() }
