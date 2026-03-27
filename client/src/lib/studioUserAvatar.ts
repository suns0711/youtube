/** ui-avatars 与侧栏/顶栏统一的占位头像 */
export function studioUserAvatarUrl(userId: string) {
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(userId)}&size=80&background=2a2a2a&color=ffffff&bold=true`
}
