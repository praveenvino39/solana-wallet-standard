const path = require('path');
const webpack = require('webpack')

module.exports = {
  entry: "./src/index.ts", // Your main entry file
  output: {
    filename: 'bundle.js', // Output filename
    path: path.resolve(__dirname, 'dist'), // Output directory
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
  },
  mode: 'production', // Set to 'production' for minification
  target: ['web', 'browserslist:> 0.25%, not dead'], // Specify target browsers
};