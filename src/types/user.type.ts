/**
 * 用户返回数据类型
 * 去除了密码等敏感字段
 */
export interface UserResType {
  id: string;
  username: string;
  avatar: string;
  roleId: number;
  active: number;
  areaId: number;
  email: string;
  remark: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}
