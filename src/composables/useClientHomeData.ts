// 分类就不需要在加表了，下次接入后台的时候可以考虑加表然后进行切换

export const CarouselSideRecommendation: {
  id: number;
  main: string;
  sub: string;
}[] = [
  { id: 1, main: '居家', sub: '居家 生活 收纳' },
  { id: 2, main: '美食', sub: '南北干货 调味 零食' },
  { id: 3, main: '服饰', sub: '钱包 腰包 换季' },
  { id: 4, main: '母婴', sub: '奶粉 纸尿布 辅食' },
  { id: 5, main: '个护', sub: '洗护 护肤 化妆' },
  { id: 6, main: '严选', sub: '品质生活 严选好物' },
  { id: 7, main: '数码', sub: '手机 电脑 智能穿戴' },
  { id: 8, main: '运动', sub: '运动服饰 运动装备' },
  { id: 9, main: '清洁', sub: '清洁用品 清洁工具' },
  { id: 10, main: '鲜果', sub: '时令鲜果 进口水果' },
];

export const CarouselData: { imgUrl: string; hrefUrl: string }[] = [
  {
    imgUrl:
      'https://img.youpin.mi-img.com/ferriswheel/f3749887_a15d_43cf_9e01_2000bb3cd54d.jpeg@base@tag=imgScale&F=webp&h=1080&q=90&w=2560',
    hrefUrl: '/category/1005000',
  },
  {
    imgUrl:
      'https://static.nike.com.cn/a/images/f_auto/dpr_2.0,cs_srgb/w_1329,c_limit/76fb6550-b7bc-4c7c-9bc1-a588bc28ae8c/hp.jpg',
    hrefUrl: '/category/1005000',
  },
  {
    imgUrl:
      'https://s1.xiaomiev.com/activity-outer-assets/0328/images/home/section1x1281.jpg',
    hrefUrl: '/category/1013001',
  },
  {
    imgUrl:
      'https://consumer.huawei.com/content/dam/huawei-cbg-site/cn/mkt/pdp/phones/mate80/img/kv/kv-2x.webp',
    hrefUrl: '/category/1013001',
  },
  {
    imgUrl:
      'https://assets.cms.elco-cloud.cn/api/assets/el-web/3557b97c-2146-4994-8b01-e90c928afea3?w=3840',
    hrefUrl: '/category/1019000',
  },
];
