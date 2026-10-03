declare module 'pdfmake/build/pdfmake' {
  const pdfMake: {
    createPdfDocument: (dd: Record<string, unknown>) => {
      getBlob: () => Promise<Blob>
      getDataUrl: (type?: string) => string
      download: (name: string) => void
    }
    vfs: Record<string, string>
  }
  export default pdfMake
}
declare module 'pdfmake/build/vfs_fonts' {
  const fonts: Record<string, string>
  export default fonts
}
