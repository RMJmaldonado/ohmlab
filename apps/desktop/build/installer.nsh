; Al desinstalar, quita también la extensión .ohmlab si todavía apunta a
; OhmLab: electron-builder borra el tipo de archivo, pero deja la extensión.
!macro customUnInstall
  ReadRegStr $0 HKCU "Software\Classes\.ohmlab" ""
  ${If} $0 == "Circuito de OhmLab"
    DeleteRegKey HKCU "Software\Classes\.ohmlab"
  ${EndIf}
!macroend
