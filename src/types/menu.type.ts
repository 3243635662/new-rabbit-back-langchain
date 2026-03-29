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
  status: boolean;
  icon: string;
  desc: string;
}
