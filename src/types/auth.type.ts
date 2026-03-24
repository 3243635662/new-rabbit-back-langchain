// 这里存放auth模块有关的一些类型

//* JWT payload
export interface JwtPayloadType {
  username: string;
  id: string; // uuid
  roleId: number;
  iat: number; // 签发时间
  exp: number; // 过期时间
}

export interface LoginResType {
  id: string; // uuid
  token: string;
}
