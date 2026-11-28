import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import { JSON_HEADERS } from '../../server/api/shared.js'
import { getApiBaseUrl, getImageUrl, getLocalResourceUrl, isTapTap } from '../../src/utils/env.js'
import {
  TAPTAP_TOP_DIR,
  buildZipBuffer,
  inspectZipBuffer,
  validateZipStructure
} from '../../scripts/dev/pack-taptap.mjs'

test('API JSON responses expose wildcard CORS header for TapTap toolbox cross-origin requests', () => {
  assert.equal(JSON_HEADERS['access-control-allow-origin'], '*')
})

test('env defaults stay unchanged when not running inside native shell or TapTap build', () => {
  assert.equal(isTapTap, false)
  assert.equal(getApiBaseUrl(), '')
  assert.equal(getImageUrl('/ui/map_w1_bg.webp'), '/ui/map_w1_bg.webp')
  assert.equal(getLocalResourceUrl('data/parsed/items.json'), 'data/parsed/items.json')
})

test('pack-taptap builds valid single-top-dir POSIX ZIP and rejects root-level or traversal entries', () => {
  const validZip = buildZipBuffer([
    { name: `${TAPTAP_TOP_DIR}/index.html`, data: Buffer.from('<!doctype html>') },
    { name: `${TAPTAP_TOP_DIR}/assets/app.js`, data: Buffer.from('console.log(1)') }
  ])
  const entries = inspectZipBuffer(validZip)
  assert.deepEqual(entries, [`${TAPTAP_TOP_DIR}/index.html`, `${TAPTAP_TOP_DIR}/assets/app.js`])
  assert.deepEqual(validateZipStructure(validZip), { count: 2, topDir: TAPTAP_TOP_DIR })

  const rootIndexZip = buildZipBuffer([{ name: 'index.html', data: Buffer.from('bad') }])
  assert.throws(() => validateZipStructure(rootIndexZip), /不允许出现散落文件/)

  const twoTopDirsZip = buildZipBuffer([
    { name: `${TAPTAP_TOP_DIR}/index.html`, data: Buffer.from('ok') },
    { name: 'extra/file.txt', data: Buffer.from('bad') }
  ])
  assert.throws(() => validateZipStructure(twoTopDirsZip), /只有一个顶层文件夹/)

  assert.throws(
    () => buildZipBuffer([{ name: `${TAPTAP_TOP_DIR}/../evil.txt`, data: Buffer.from('bad') }]),
    /非法 ZIP 条目路径/
  )
})

test('pack-taptap removes Cloudflare/dev-only files before zipping', async () => {
  const { pruneTapTapDir } = await import('../../scripts/dev/pack-taptap.mjs')
  const tmpDir = fs.mkdtempSync(path.join(process.cwd(), '.tmp-taptap-prune-'))
  try {
    fs.mkdirSync(path.join(tmpDir, 'tools'), { recursive: true })
    fs.mkdirSync(path.join(tmpDir, 'update'), { recursive: true })
    fs.mkdirSync(path.join(tmpDir, 'assets'), { recursive: true })
    fs.writeFileSync(path.join(tmpDir, 'tools', 'x.html'), 'x')
    fs.writeFileSync(path.join(tmpDir, 'update', 'hotupdate.json'), '{}')
    fs.writeFileSync(path.join(tmpDir, '_headers'), '/*')
    fs.writeFileSync(path.join(tmpDir, 'baidu-analytics.js'), '')
    fs.writeFileSync(path.join(tmpDir, 'assets', 'app.js.map'), '{}')
    fs.writeFileSync(path.join(tmpDir, 'index.html'), '<html></html>')

    pruneTapTapDir(tmpDir)
    assert.equal(fs.existsSync(path.join(tmpDir, 'tools')), false)
    assert.equal(fs.existsSync(path.join(tmpDir, 'update')), false)
    assert.equal(fs.existsSync(path.join(tmpDir, '_headers')), false)
    assert.equal(fs.existsSync(path.join(tmpDir, 'baidu-analytics.js')), false)
    assert.equal(fs.existsSync(path.join(tmpDir, 'assets', 'app.js.map')), false)
    assert.equal(fs.existsSync(path.join(tmpDir, 'index.html')), true)
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  }
})
