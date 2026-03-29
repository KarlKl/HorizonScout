module.exports = [
  {
    type: "heading",
    defaultValue: "Horizon Scout",
  },
  {
    type: "section",
    items: [
      {
        type: "heading",
        defaultValue: "Display",
      },
      {
        type: "toggle",
        messageKey: "showHeader",
        label: "Show header",
        defaultValue: true,
      },
      {
        type: "toggle",
        messageKey: "showCardinals",
        label: "Show cardinal markers",
        defaultValue: true,
      },
      {
        type: "toggle",
        messageKey: "showPeaks",
        label: "Show peaks",
        defaultValue: true,
      },
      {
        type: "slider",
        messageKey: "horizonWindowDeg",
        label: "Horizon window (FOV) in degrees",
        defaultValue: 100,
        min: 30,
        max: 360,
        step: 10,
      },
    ],
  },
  {
    type: "section",
    items: [
      {
        type: "heading",
        defaultValue: "Data",
      },
      {
        type: "select",
        messageKey: "language",
        label: "Peak language",
        defaultValue: "en",
        options: [
          {
            label: "English",
            value: "en",
          },
          {
            label: "Deutsch",
            value: "de",
          },
          {
            label: "Français",
            value: "fr",
          },
          {
            label: "Spanish",
            value: "es",
          },
          {
            label: "Italiano",
            value: "it",
          },
          {
            label: "Nederlands",
            value: "nl",
          },
          {
            label: "Czech",
            value: "cs",
          },
          {
            label: "Arabic",
            value: "ar",
          },
          {
            label: "Russian",
            value: "ru",
          },
          {
            label: "Chinese (Simplified)",
            value: "zh_CN",
          },
          {
            label: "Chinese (Traditional, Hong Kong)",
            value: "zh_HK",
          },
          {
            label: "Chinese (Traditional, Taiwan)",
            value: "zh_TW",
          },
          {
            label: "Japanese",
            value: "ja",
          },
          {
            label: "Korean",
            value: "ko",
          },
          {
            label: "Romanian",
            value: "ro",
          },
          {
            label: "Turkish",
            value: "tr",
          },
          {
            label: "Bulgarian",
            value: "bg",
          },
          {
            label: "Danish",
            value: "da",
          },
          {
            label: "Greek",
            value: "el",
          },
          {
            label: "Finnish",
            value: "fi",
          },
          {
            label: "Hungarian",
            value: "hu",
          },
          {
            label: "Indonesian",
            value: "id",
          },
          {
            label: "Polish",
            value: "pl",
          },
          {
            label: "Portuguese (Brazil)",
            value: "pt_BR",
          },
          {
            label: "Slovak",
            value: "sk",
          },
          {
            label: "Slovenian",
            value: "sl",
          },
          {
            label: "Swedish",
            value: "sv",
          },
          {
            label: "Thai",
            value: "th",
          },
          {
            label: "Ukrainian",
            value: "uk",
          },
          {
            label: "Vietnamese",
            value: "vi",
          },
        ],
      },
    ],
  },
  {
    type: "submit",
    defaultValue: "Save",
  },
];
