const bent = require('bent')
const qs = require('querystring')
const parser = require('parse-link-header')

const reduce = langs => {
  const sum = (x, y) => x + y
  const total = Object.values(langs).reduce(sum, 0)
  for (const [key, value] of Object.entries(langs)) {
    langs[key] = parseFloat((value / total).toFixed(2))
  }
  return langs
}

module.exports = token => {
  const headers = {
    authorization: `token ${token}`,
    'user-agent': 'inquisitorius-0.0.1'
  }
  const writeHeaders = Object.assign({}, headers, {
    'content-type': 'application/json'
  })

  const json = async stream => {
    const parts = []
    for await (const chunk of stream) {
      parts.push(chunk)
    }
    return JSON.parse(Buffer.concat(parts).toString())
  }

  const u = (path, opts) => {
    return `${path}?${qs.stringify(opts)}`
  }

  const get = bent('https://api.github.com', headers)
  const put = bent('PUT', 204, 'https://api.github.com', writeHeaders)
  const del = bent('DELETE', 204, 'https://api.github.com', headers)

  const rateLimit = resp => {
    const remaining = parseInt(resp.headers['x-ratelimit-remaining'])
    if (remaining === 0) {
      const reset = parseInt(resp.headers['x-ratelimit-reset'])
      return new Promise(resolve => setTimeout(resolve, reset - (Date.now() + 10000)))
    }
  }

  const getAll = async (path, opts = {}) => {
    opts.limit = 100
    let resp = await get(u(path, opts))
    await rateLimit(resp)
    let links = parser(resp.headers.link)
    let results = await json(resp)
    while (links && links.next) {
      resp = await (bent(headers)(links.next.url))
      await rateLimit(resp)
      links = parser(resp.headers.link)
      results = results.concat(await json(resp))
    }
    return results
  }

  const load = async (org, token) => {
    const repos = await getAll(`/orgs/${org}/repos`)
    const teams = await getAll(`/orgs/${org}/teams`)
    const teamMap = {}
    const reposMap = {}
    for (const team of teams) {
      teamMap[team.id] = team
      teamMap[team.name] = team
      teamMap[team.slug] = team
      team.repos = await getAll(`/teams/${team.id}/repos`)
    }
    for (const repo of repos) {
      reposMap[repo.full_name] = repo
      const resp = await get(`/repos/${repo.full_name}/languages`)
      await rateLimit(resp)
      repo.languages = reduce(await json(resp))
    }
    return { repos, reposMap, teamMap, teams }
  }

  const adjust = async (repo, team, perm, dry) => {
    if (repo.full_name === 'ipld/specs') console.log(repo.full_name, team.slug, perm)
    if (dry) return console.log('set', perm || 'remove', 'permission for', team.slug, 'in', repo.full_name)
    else {
      const path = `/teams/${team.id}/repos/${repo.full_name}`
      if (perm) {
        await put(path, JSON.stringify({permission: perm}))
      } else {
        await del(path)
      }
    }
  }

  const makeAdjustments = (repo, team, p, dry) => {
    const _adjust = () => adjust(repo, team, p, dry)
    const tperms = repo.permissions
    if (!p) {
      _adjust()
    } else if (p === 'pull') {
      if (tperms.admin || tperms.push || !tperms.pull) _adjust()
    } else if (p === 'push') {
      if (tperms.admin || !tperms.push) _adjust()
    } else if (p === 'admin') {
      if (!tperms.admin) _adjust()
    } else {
      throw new Error('Unknown permission setting: ' + p)
    }
  }

  const run = async (org, teams, dry = true) => {
    const { repos, reposMap, teamMap } = await load(org)
    for (const [name, perms] of Object.entries(teams)) {
      const team = teamMap[name]
      const seen = new Set()
      for (const repo of team.repos) {
        seen.add(repo.full_name)
        const p = await perms(reposMap[repo.full_name])
        await makeAdjustments(repo, team, p, dry)
      }
      for (const repo of repos) {
        if (seen.has(repo.full_name)) continue
        const p = await perms(repo)
        if (p) await makeAdjustments(repo, team, p, dry)
      }
    }
  }
  return run
}
