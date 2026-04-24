# registro/signals.py
from django.db.models.signals import pre_save, post_save, post_delete
from django.dispatch import receiver
from django.forms.models import model_to_dict
from django.conf import settings
from threading import local

from .models import (
    Pesagem, Produto, MateriaPrima, OrdemProducao, ItemOP, Balanca
)
# use o caminho que você realmente criou para o modelo de logs
from registro.audit_models import AuditLog  # <- ajuste se seu arquivo se chama diferente
from .utils.jsonify import jsonable

# -------------------------
# Request context (thread-local)
# -------------------------
_request_local = local()

def bind_request_to_thread(request):
    _request_local.request = request

def current_request():
    return getattr(_request_local, "request", None)

# -------------------------
# Helpers de diff e snapshot
# -------------------------
def diff_dict(old, new):
    changes = {}
    for k in new.keys():
        old_val = old.get(k)
        new_val = new.get(k)
        if old_val != new_val:
            changes[k] = [old_val, new_val]
    return jsonable(changes)

def snapshot(instance):
    data = model_to_dict(instance)
    # remova campos ruidosos se houver no seu modelo
    data.pop("data_hora", None)
    return jsonable(data)

def _log_change(instance, action, changes=None):
    # não logar se auditoria desligada
    if not getattr(settings, "AUDIT_ENABLED", False):
        return
    req = current_request()
    try:
        AuditLog.objects.create(
            user=getattr(req, "user", None) if (req and getattr(req, "user", None) and req.user.is_authenticated) else None,
            ip=(req.META.get("HTTP_X_FORWARDED_FOR", "").split(",")[0].strip() or req.META.get("REMOTE_ADDR"))
               if req else None,
            user_agent=req.META.get("HTTP_USER_AGENT", "") if req else "",
            path=getattr(req, "path", "") or "",
            method=getattr(req, "method", "") or "",
            action=action,
            model=instance.__class__.__name__,
            object_pk=str(getattr(instance, "pk", "")),
            changes=jsonable(changes or {}),
        )
    except Exception:
        # nunca derrubar a requisição por falha de auditoria
        import logging
        logging.getLogger(__name__).exception("Falha ao gravar AuditLog")

# -------------------------
# Conjunto de modelos rastreados
# -------------------------
_tracked = (Pesagem, Produto, MateriaPrima, OrdemProducao, ItemOP, Balanca)
_state = local()

def _before():
    if not hasattr(_state, "before"):
        _state.before = {}
    return _state.before

# -------------------------
# Sinais
# -------------------------
@receiver(pre_save)
def before_save(sender, instance, **kwargs):
    if not getattr(settings, "AUDIT_ENABLED", False):
        return
    if sender not in _tracked or not instance.pk:
        return
    try:
        old = sender.objects.get(pk=instance.pk)
        _before()[(sender, instance.pk)] = snapshot(old)
    except sender.DoesNotExist:
        pass

@receiver(post_save)
def after_save(sender, instance, created, **kwargs):
    if not getattr(settings, "AUDIT_ENABLED", False):
        return
    if sender not in _tracked:
        return
    if created:
        _log_change(instance, "create", snapshot(instance))
    else:
        old = _before().pop((sender, instance.pk), {})
        new = snapshot(instance)
        changes = diff_dict(old, new)
        if changes:
            _log_change(instance, "update", changes)

@receiver(post_delete)
def after_delete(sender, instance, **kwargs):
    if not getattr(settings, "AUDIT_ENABLED", False):
        return
    if sender not in _tracked:
        return
    _log_change(instance, "delete", snapshot(instance))
