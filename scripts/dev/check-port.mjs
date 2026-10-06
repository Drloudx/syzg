/**
 * 端口预检（给 `npm run dev:api` 当前置步骤）。
 *
 * ## 为什么需要它
 *
 * `wrangler pages dev` **没有 `--strictPort`**：端口被占时它会**静默换一个端口**继续启动，
 * 而调用方（包括人和脚本）仍然按原来那个端口去访问 —— 于是**测到的是旧服务**。
 *
 * 这个坑真的踩过：一个几小时前启动的僵尸 `workerd` 占着 8788，
 * 于是新起的服务换了端口，而所有探测都打在旧服务上。
 * 表现是"代码明明改了，行为却没变"，且**没有任何报错**——
 * 当时现象是账号接口一直回 503（旧服务那时还没有 AUTH_PEPPER），查了很久。
 *
 * 所以：**先确认端口空闲，再启动**。宁可起不来，也不要"起来了但你没在测它"。
 */

import net from 'node:net'

const port = Number(process.argv[2])
if (!Number.isInteger(port) || port <= 0) {
  console.error('用法: node scripts/dev/check-port.mjs <port>')
  process.exit(2)
}

const server = net.createServer()

server.once('error', (err) => {
  if (err.code === 'EADDRINUSE' || err.code === 'EACCES') {
    console.error('')
    console.error(`  ❌ 端口 ${port} 已被占用，停止启动。`)
    console.error('')
    console.error('  为什么这是错误而不是警告：wrangler pages dev 没有 --strictPort，')
    console.error('  它会**静默换一个端口**继续跑。那样你会以为自己在测新服务，')
    console.error('  实际测的是旧的那一个 —— 而且不会有任何报错。')
    console.error('')
    console.error('  先清掉占用者（Windows）：')
    console.error(`    netstat -ano | findstr :${port}`)
    console.error('    taskkill /PID <上面查到的PID> /T /F')
    console.error('')
    console.error('  注意 /T：workerd 是 wrangler 的子进程，只杀父进程它会活下来。')
    console.error('')
    process.exit(1)
  }
  throw err
})

server.once('listening', () => {
  server.close(() => {
    console.log(`  端口 ${port} 空闲 ✅`)
    process.exit(0)
  })
})

server.listen(port, '127.0.0.1')
