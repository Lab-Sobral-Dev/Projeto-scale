# apps/reports/urls.py
from django.urls import path
from .views.pesagens import PesagensReportView
from .views.balancas import BalancasUsoReportView
from .views.cadastros import ProdutosReportView, MateriasPrimasReportView
from .views.estrutura import EstruturaProdutoReportView
from .views.usuarios import UsuariosReportView, PermissoesTelasReportView
from .views.auditoria import (
    AuditoriaAcoesReportView, AuditoriaExclusoesReportView, AuditoriaAuthErrosReportView,
    AuditoriaLogsSistemaReportView
)
from .views.backups import BackupsReportView, RestoresReportView

urlpatterns = [
    path('pesagens/', PesagensReportView.as_view()),
    path('balancas/', BalancasUsoReportView.as_view()),
    path('produtos/', ProdutosReportView.as_view()),
    path('materias-primas/', MateriasPrimasReportView.as_view()),
    path('estrutura/', EstruturaProdutoReportView.as_view()),
    path('usuarios/', UsuariosReportView.as_view()),
    path('permissoes/', PermissoesTelasReportView.as_view()),
    path('auditoria/acoes/', AuditoriaAcoesReportView.as_view()),
    path('auditoria/exclusoes/', AuditoriaExclusoesReportView.as_view()),
    path('auditoria/auth-erros/', AuditoriaAuthErrosReportView.as_view()),
    path('auditoria/logs-sistema/', AuditoriaLogsSistemaReportView.as_view()),
    path('backups/', BackupsReportView.as_view()),
    path('restores/', RestoresReportView.as_view()),
]