export const log = (message: string) => {
  console.log(message)
}

export const logFn = (scope: string) => {
  return (message: string) => log(`[${scope}] ${message}`)
}