# registro/middleware_requestctx.py
from .signals import bind_request_to_thread
from django.utils.deprecation import MiddlewareMixin

class RequestContextMiddleware(MiddlewareMixin):
    def process_request(self, request):
        bind_request_to_thread(request)
