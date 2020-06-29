module.exports = {
  publicPath: process.env.NODE_ENV === 'development' ? '/' : '/static/breezy/',
  devServer: {
    host: '127.0.0.1',
    proxy: {
      // proxy all requests starting with /proxy to jsonplaceholder
      '/proxy': {
        target: 'http://www.sailonline.org',
        changeOrigin: true,
        ws: true,
        pathRewrite: {
          '^/proxy': ''
        }
      }
    }
  },
  chainWebpack: config => {
    config.module
      .rule('images')
      .use('url-loader')
        .loader('url-loader')
        .tap(options => {
          options.limit = 1;
          return options;
        })
  },
  pages: {
    index: {
      entry: 'src/main.js',
      template: 'public/index.html',
      filename: 'index.html',
    },
    template: {
      entry: 'src/main.js',
      template: 'public/index.template.html',
      filename: 'index.template.html',
    },
    spectator: {
      entry: 'src/main.js',
      template: 'public/spectator.html',
      filename: 'spectator.html',
    },
  },
}

const GitRevisionPlugin = require("git-revision-webpack-plugin")
const git = new GitRevisionPlugin({ versionCommand: "rev-parse --short HEAD" })
process.env.VUE_APP_GIT_REV = git.version()
