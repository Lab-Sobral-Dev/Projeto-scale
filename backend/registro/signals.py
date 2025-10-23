# registro/signals.py
from django.db.models.signals import pre_save, post_save, post_delete
from django.dispatch import receiver
from django.forms.models import model_to_dict
from .models import Pesagem, Produto, MateriaPrima, OrdemProducao, ItemOP, Balanca
from registro.audit_models import AuditLog
from threading import local

_request_local = local()

def bind_request_to_thread(request):
    _request_local.request = request

def current_request():
    return getattr(_request_local, "request", None)

def diff_dict(old, new):
    changes = {}
    for k in new.keys():
        old_val = old.get(k)
        new_val = new.get(k)
        if old_val != new_val:
            changes[k] = [old_val, new_val]
    return changes

def _log_change(instance, action, changes=None):
    req = current_request()
    AuditLog.objects.create(
        user=getattr(req, "user", None) if req and req.user.is_authenticated else None,
        ip=req.META.get("REMOTE_ADDR") if req else None,
        user_agent=req.META.get("HTTP_USER_AGENT","") if req else "",
        path=req.path if req else "",
        method=req.method if req else "",
        action=action,
        model=instance.__class__.__name__,
        object_pk=str(instance.pk),
        changes=changes or {}
    )

def snapshot(instance):
    data = model_to_dict(instance)
    # opcional: remover campos ruidosos
    data.pop("data_hora", None)
    return data

_tracked = (Pesagem, Produto, MateriaPrima, OrdemProducao, ItemOP, Balanca)
_before = {}

@receiver(pre_save)
def before_save(sender, instance, **kwargs):
    if sender not in _tracked or not instance.pk:
        return
    try:
        old = sender.objects.get(pk=instance.pk)
        _before[(sender, instance.pk)] = snapshot(old)
    except sender.DoesNotExist:
        pass

@receiver(post_save)
def after_save(sender, instance, created, **kwargs):
    if sender not in _tracked:
        return
    if created:
        _log_change(instance, "create", snapshot(instance))
    else:
        old = _before.pop((sender, instance.pk), {})
        new = snapshot(instance)
        changes = diff_dict(old, new)
        if changes:
            _log_change(instance, "update", changes)

@receiver(post_delete)
def after_delete(sender, instance, **kwargs):
    if sender not in _tracked:
        return
    _log_change(instance, "delete", snapshot(instance))
