from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView

from .views import (
    UserViewSet,
    PerfilUsuarioViewSet,
    MeView,
    ScreenViewSet,
    RoleViewSet,
)
from .auth import TokenWithFlagsView  # ✅ nova view com flags
from .views_auth import change_password  # ✅ nova view de troca de senha
from .views_security import UserSecurityView  # ✅ novas rotas de segurança (admin)

# Rotas padrão com router
router = DefaultRouter()
router.register(r'usuarios', UserViewSet, basename='usuarios')
router.register(r'perfis', PerfilUsuarioViewSet, basename='perfis')
router.register(r'screens', ScreenViewSet, basename='screens')
router.register(r'roles', RoleViewSet, basename='roles')

# Instância da view de segurança admin
security = UserSecurityView.as_view

urlpatterns = [
    # Rotas principais dos viewsets
    path('', include(router.urls)),

    # Autenticação e sessão
    path('auth/login/', TokenWithFlagsView.as_view(), name='token_obtain_pair'),
    path('auth/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('auth/me/', MeView.as_view(), name='me'),
    path('auth/change-password/', change_password, name='change_password'),  # ✅ nova

    # Rotas de segurança (admin)
    path('security/<int:pk>/', security({'get': 'retrieve'}), name='user_security'),
    path('security/<int:pk>/unlock/', security({'post': 'unlock'}), name='user_unlock'),
    path('security/<int:pk>/force-reset/', security({'post': 'force_reset'}), name='user_force_reset'),
]
