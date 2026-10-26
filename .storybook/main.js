/** @type { import('@storybook/nextjs').StorybookConfig } */
const config = {
  stories: ["../src/components/**/*.stories.@(js|jsx|mjs|ts|tsx)"],

  addons: [
    "@storybook/addon-onboarding",
    "@storybook/addon-links",
    "@storybook/addon-essentials",
    "@chromatic-com/storybook",
    "@storybook/addon-interactions",
    '@storybook/addon-postcss',
    "@storybook/addon-mdx-gfm"
  ],

  framework: '@storybook/nextjs',
  core: {
    builder: 'webpack5',
  },

  staticDirs: process.platform === "win32" ? ["..\\public"] : ["../public"],

  webpackFinal: async (config) => {
    // Find and remove the default CSS rule
    config.module.rules = config.module.rules.filter(
      (rule) => !rule.test?.test?.('.css')
    );

    // Add our custom CSS rule
    config.module.rules.push({
      test: /\.css$/,
      use: [
        'style-loader',
        {
          loader: 'css-loader',
          options: {
            importLoaders: 1,
          },
        },
        {
          loader: 'postcss-loader',
          options: {
            implementation: require('postcss'),
            postcssOptions: {
              config: true, // This will load your postcss.config.js
            },
          },
        },
      ],
    });

    return config;
  },

  docs: {
    autodocs: true
  }
};

export default config;
