/**
 * 同步协议 — JSON 增量消息定义与序列化
 */

import { v4 as uuid } from 'uuid'

/* ── 消息类型 ── */

export const MSG_TYPE = {
  STROKE: 'stroke',
  TEXT: 'text',
  IMAGE: 'image',
  ERASE: 'erase',
  PING: 'ping',
  PONG: 'pong',
  PEER_JOIN: 'peer_join',
  PEER_LEAVE: 'peer_leave',
}

/* ── 创建消息 ── */

/**
 * @param {object} opts
 * @param {string} opts.pageId
 * @param {string} opts.userId
 * @param {object} opts.payload - stroke { points, color, width }, text { content }, image { url, w, h }, erase { strokeIds }
 * @param {string} [opts.type]
 */
export function createOp(opts) {
  return {
    id: uuid(),
    pageId: opts.pageId,
    userId: opts.userId,
    type: opts.type || MSG_TYPE.STROKE,
    payload: opts.payload,
    ts: Date.now(),
    source: opts.userId,
  }
}

/** 创建 stroke 消息 */
export function createStroke(pageId, userId, points, color, width) {
  return createOp({ pageId, userId, type: MSG_TYPE.STROKE, payload: { points, color, width } })
}

/** 创建 erase 消息 */
export function createErase(pageId, userId, strokeIds) {
  return createOp({ pageId, userId, type: MSG_TYPE.ERASE, payload: { strokeIds } })
}

/** 创建 text 消息 */
export function createText(pageId, userId, content) {
  return createOp({ pageId, userId, type: MSG_TYPE.TEXT, payload: { content } })
}

/** 创建 image 消息 */
export function createImage(pageId, userId, url) {
  return createOp({ pageId, userId, type: MSG_TYPE.IMAGE, payload: { url } })
}

/* ── 序列化 ── */

export function serialize(msg) {
  return JSON.stringify(msg)
}

export function deserialize(str) {
  try {
    return JSON.parse(str)
  } catch {
    return null
  }
}

/* ── 验证 ── */

export function isValidOp(msg) {
  return !!(
    msg &&
    msg.id &&
    msg.pageId &&
    msg.userId &&
    msg.type &&
    Object.values(MSG_TYPE).includes(msg.type) &&
    msg.ts
  )
}
