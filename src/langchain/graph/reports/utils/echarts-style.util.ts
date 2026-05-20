/**
 * 统一 ECharts 颜色、字体、背景等默认样式
 * 让 LLM 生成的各种图表风格更统一
 */

const defaultColorPalette = [
  '#5470C6',
  '#91CC75',
  '#FAC858',
  '#EE6666',
  '#73C0DE',
  '#3BA272',
  '#FC8452',
  '#9A60B4',
  '#EA7CCC',
];

export const withDefaultEchartsStyle = (
  option: Record<string, unknown>,
): Record<string, unknown> => {
  return {
    color: option.color || defaultColorPalette,
    backgroundColor: option.backgroundColor || '#ffffff',
    textStyle: {
      fontFamily:
        (option.textStyle as { fontFamily?: string } | undefined)?.fontFamily ||
        'Arial, "PingFang SC", "Microsoft YaHei", sans-serif',
      ...((option.textStyle as Record<string, unknown>) || {}),
    },
    ...option,
  };
};
