export interface MenuMeta {
  title: string;
  orderNo?: number;
  keepAlive: boolean;
}

export interface MenuResType {
  id: number;
  name: string;
  path: string;
  redirect: string;
  meta: MenuMeta;
  pid: number;
  status: number;
  icon: string;
  desc: string;
}
