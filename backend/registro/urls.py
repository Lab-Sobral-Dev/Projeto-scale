from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import (
    ProdutoViewSet, MateriaPrimaViewSet, BalancaViewSet,
    EstruturaProdutoViewSet, ItemEstruturaViewSet,
    OrdemProducaoViewSet, ItemOPViewSet,
    PesagemViewSet, gerar_etiqueta_pdf
)

router = DefaultRouter()
router.register(r'produtos', ProdutoViewSet)
router.register(r'materias-primas', MateriaPrimaViewSet)
router.register(r'balancas', BalancaViewSet)

# BOM
router.register(r'estruturas', EstruturaProdutoViewSet)
router.register(r'itens-estrutura', ItemEstruturaViewSet)

# OP
router.register(r'ops', OrdemProducaoViewSet)
router.register(r'itens-op', ItemOPViewSet)

# Pesagens
router.register(r'pesagens', PesagemViewSet)

urlpatterns = [
    path('', include(router.urls)),
    path('etiqueta/<int:pk>/', gerar_etiqueta_pdf, name='gerar_etiqueta'),
]
