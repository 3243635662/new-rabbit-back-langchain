import * as bcrypt from 'bcrypt';

export class BcryptUtil {
  /**
   * 加密密码
   * @param password 明文密码
   * @param saltRounds 盐的轮数
   * @returns 密文
   */
  static async hash(password: string, saltRounds: number): Promise<string> {
    return await bcrypt.hash(password, saltRounds);
  }

  /**
   * 校验密码
   * @param password 明文密码
   * @param hashedPassword 密文密码
   * @returns 是否匹配
   */
  static async compare(
    password: string,
    hashedPassword: string,
  ): Promise<boolean> {
    return await bcrypt.compare(password, hashedPassword);
  }
}
