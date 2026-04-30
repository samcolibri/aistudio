import { Config } from '@remotion/cli/config';

Config.setPublicDir('./remotion/public');

Config.overrideWebpackConfig((config) => {
  return {
    ...config,
    module: {
      ...config.module,
      rules: [
        ...(config.module?.rules ?? []),
        {
          test: /\.(png|jpg|jpeg|gif|webp)$/i,
          type: 'asset/inline',  // embed as base64 data URLs — no HTTP serving needed
        },
      ],
    },
  };
});
