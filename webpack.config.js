const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

module.exports = {
  entry: {
    'content/index': './src/content/index.js',
    'background/service-worker': './src/background/service-worker.js',
    'ui/popup': './src/ui/popup.js',
    'ui/settings': './src/ui/settings.js',
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
