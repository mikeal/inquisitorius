'use strict'
const run = module.exports(process.env.GHTOKEN)

/* Repos that pretty much everyone should be on */
const openRepo = new Set([
  'ipld-examples',
  'specs',
  'interface-ipld-format',
  'ipld',
  'replication',
  'team-mgmt',
  'cid-cbor'
])

const fallbacks = repo => {
  if (openRepo.has(repo.name)) return 'pull'
  return false
}

run('ipld', {
  core: repo => {
    if (repo.name === 'specs') return 'push'
    return 'pull'
  },
  'javascript-team': repo => {
    if (repo.languages.JavaScript && repo.languages.JavaScript > 0.5) return 'push'
    if (repo.name.startsWith('js-')) return 'push'
    return fallbacks(repo)
  },
  'go-team': repo => {
    if (repo.languages.Go && repo.languages.Go > 0.5) return 'push'
    if (repo.name.startsWith('go-')) return 'push'
    return fallbacks(repo)
  },
  'rust-team': repo => {
    if (repo.languages.Rust && repo.languages.Rust > 0.5) return 'push'
    if (repo.name.startsWith('rust-')) return 'push'
    return fallbacks(repo)
  }
})
