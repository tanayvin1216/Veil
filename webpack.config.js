const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

module.exports = {
  entry: {
    'content/index': './src/content/index.js',
    'background/service-worker': './src/background/service-worker.js',
    'ui/popup': './src/ui/popup.js',
    'ui/settings': './src/ui/settings.js',
    'gesture/gesture-recognizer': './src/gesture/gesture-recognizer.js',
  },

  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    clean: true,
  },

  module: {
    rules: [
      {
        test: /\.css$/,
        use: [MiniCssExtractPlugin.loader, 'css-loader'],
      },
    ],
  },

  plugins: [
    new MiniCssExtractPlugin({
      filename: '[name].css',
    }),

    new CopyWebpackPlugin({
      patterns: [
        { from: 'manifest.json', to: 'manifest.json' },
        { from: 'assets', to: 'assets' },
        { from: 'src/ui/popup.html', to: 'ui/popup.html' },
        { from: 'src/ui/popup.css', to: 'ui/popup.css' },
        { from: 'src/ui/settings.html', to: 'ui/settings.html' },
        { from: 'src/ui/settings.css', to: 'ui/settings.css' },
        { from: 'src/ui/welcome.html', to: 'ui/welcome.html' },
        { from: 'src/ui/welcome.js', to: 'ui/welcome.js' },
        { from: 'src/content/content.css', to: 'content/content.css' },
        { from: 'src/gesture/offscreen.html', to: 'gesture/offscreen.html' },
        { from: 'node_modules/@mediapipe/tasks-vision/wasm', to: 'wasm' },
      ],
    }),
  ],

  resolve: {
    extensions: ['.js'],
  },

  devtool: 'cheap-module-source-map',

  optimization: {
    minimize: true,
  },
};
