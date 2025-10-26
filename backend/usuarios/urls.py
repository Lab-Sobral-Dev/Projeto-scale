from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    UserViewSet, PerfilUsuarioViewSet, MeView,
    ScreenViewSet, RoleViewSet
)
from .auth import TokenWithScreensView
from rest_framework_simplejwt.views import TokenRefreshView

router = DefaultRouter()
router.register(r'usuarios', UserViewSet, basename='usuarios')
router.register(r'perfis', PerfilUsuarioViewSet, basename='perfis')
router.register(r'screens', ScreenViewSet, basename='screens')
router.register(r'roles', RoleViewSet, basename='roles')

urlpatterns = [
    path('', include(router.urls)),
    path('auth/login/', TokenWithScreensView.as_view(), name='token_obtain_pair'),
    path('auth/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('auth/me/', MeView.as_view(), name='me'),
]
