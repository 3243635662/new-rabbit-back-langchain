/**
 * 统一 ECharts 颜色、字体、背景等默认样式
 * 让 LLM 生成的各种图表风格更统一
 * 同时强制添加适合 PDF 打印的静态配置（禁用交互）
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
  const merged: Record<string, unknown> = {
    color: option.color || defaultColorPalette,
    backgroundColor: option.backgroundColor || '#ffffff',
    textStyle: {
      fontFamily:
        (option.textStyle as { fontFamily?: string } | undefined)?.fontFamily ||
        'Arial, "PingFang SC", "Microsoft YaHei", sans-serif',
      ...((option.textStyle as Record<string, unknown>) || {}),
    },
    // 禁用动画和交互
    animation: false,
    animationDuration: 0,
    // 禁用 dataZoom
    dataZoom: undefined,
    // 禁用 brush
    brush: undefined,
    // 禁用 toolbox
    toolbox: undefined,
    // 禁用 title（避免与外部 HTML 标题重复）
    title: undefined,
    // 禁用 graphic
    graphic: undefined,
    // tooltip hover 保留，但确保使用静态配置
    tooltip: option.tooltip
      ? {
          ...(option.tooltip as Record<string, unknown>),
          show: true,
          trigger:
            (option.tooltip as Record<string, unknown>)?.trigger || 'item',
        }
      : { show: true, trigger: 'item' },
    // 禁用 legend 的点击交互（图例切换）
    legend: option.legend
      ? {
          ...(option.legend as Record<string, unknown>),
          selectedMode: false,
        }
      : { selectedMode: false },
    ...option,
  };

  // 再次确保禁用配置不会被 LLM 配置覆盖
  merged.animation = false;
  merged.animationDuration = 0;
  merged.dataZoom = undefined;
  merged.brush = undefined;
  merged.toolbox = undefined;
  merged.title = undefined;
  merged.graphic = undefined;

  return merged;
};
