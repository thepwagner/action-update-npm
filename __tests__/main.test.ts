import * as process from 'process'
import * as cp from 'child_process'
import * as path from 'path'

// shows how the runner will run a javascript action with env / stdout protocol
test('test runs', () => {
  process.env['GITHUB_EVENT_NAME'] = 'repository_vulnerability_alert'
  process.env['GITHUB_EVENT_PATH'] = path.join(__dirname, 'fixtures', 'repository_vulnerability_alert.json')
  console.log(process.env['GITHUB_EVENT_PATH'])
  const ip = path.join(__dirname, '..', 'lib', 'main.js')
  const options: cp.ExecSyncOptions = {
    env: process.env
  }
  console.log(cp.execSync(`node ${ip}`, options).toString())
})
