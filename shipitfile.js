/*global shipit*/
var process_name = 'index'
var start_script = 'start.sh'
var deployPath = '/home/blake/apps/sesprout/server'
var currentPath = deployPath + '/current'
var sharedPath = deployPath + '/shared'
module.exports = function (shipit) {
  require('shipit-deploy')(shipit)

  shipit.initConfig({
    default: {
      workspace: '/tmp/sesprout-app-server',
      deployTo: '~/apps/sesprout/server',
      repositoryUrl: 'git@bitbucket.org:bmills22/sesprout-server.git',
      ignores: ['.git', 'node_modules'],
      branch: 'master',
      rsync: ['--del'],
      keepReleases: 2,
      key: '~/.ssh/id_rsa.pub',
      shallowClone: false
    },
    staging: {
      servers: 'blake@sesprout-test-app-server'
    },
    production: {
      servers: 'blake@sesprout-app-server'
    }
  })
  shipit.blTask('stop_pm2', function () {
    return shipit.remote("pm2 stop " + process_name)
  })

  shipit.blTask('remove_pm2_process', function () {
    return shipit.remote("pm2 delete " + process_name)
  })

  shipit.blTask('install', function () {
    return shipit.remote("cd " + currentPath + " && npm install &> /dev/null")
  })

  shipit.blTask('install_config', function() {
    return shipit.remote('cd ' + sharedPath + ' && cp .env ' + currentPath)
  })

  shipit.blTask('start_script_chmod', function() {
    shipit.remote('chmod +x ' + currentPath + '/' + start_script)
  })
  // shipit.blTask('start_script_start', function() {
  //   shipit.remote(currentPath + '/' + start_script)
  // })

  shipit.on('deployed', function () {
    shipit.start( 'stop_pm2', 'remove_pm2_process', 'install', 'install_config', 'start_script_chmod')
  })
}