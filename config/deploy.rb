# config valid only for current version of Capistrano
lock '3.5.0'

set :application, 'sesprout-server'
set :repo_url, 'git@bitbucket.org:bmills22/sesprout-server.git'
set :deploy_to, '/home/blake/apps/sesprout/server'

# You can configure the Airbrussh format using :format_options.
# These are the defaults.
set :format_options, command_output: true, log_file: 'logs/capistrano.log', color: :auto, truncate: :auto

# Default value for keep_releases is 5
set :keep_releases, 2

namespace :deploy do
  after :restart, :clear_cache do
    on roles(:web), in: :groups, limit: 3, wait: 10 do
    end
  end
end

namespace :deploy do

  desc 'Restart application'
  task :restart do
    invoke 'pm2:restart'
  end

  after :publishing, :restart
end
